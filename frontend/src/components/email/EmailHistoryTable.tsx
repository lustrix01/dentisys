import React, { useState } from 'react';
import { Search, Mail, ChevronRight } from 'lucide-react';
import { formatManilaWhen } from '../../services/auditService';
import { EmailAction, EmailStatus, filterEmailActions, recipientsLabel, summarizeStatuses } from './emailHistory';

// The email_type values the server stores for a Faculty member's messages.
export type EmailType =
  | 'Privacy Consent'
  | 'At-Risk Notification'
  | 'Secretary Invitation'
  | 'Student Invitation'
  | 'Other';

interface EmailHistoryTableProps {
  actions: EmailAction[];
  search: string;
  onSearch: (value: string) => void;
  // Omit both to hide the category filter (Dean).
  filter?: string;
  onFilter?: (value: string) => void;
}

const statusChipClass = (status: EmailStatus) =>
  status === 'Sent'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
    : status === 'Failed'
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
    : status === 'Suppressed'
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';

export const EmailHistoryTable: React.FC<EmailHistoryTableProps> = ({
  actions,
  search,
  onSearch,
  filter,
  onFilter,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const visible = filterEmailActions(actions, search, filter ?? 'all');

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search recipient or email type..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500"
          />
        </label>
        {filter !== undefined && onFilter && (
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500 font-semibold"
          >
            <option value="all">All email categories</option>
            <option value="Privacy Consent">Privacy Consent</option>
            <option value="At-Risk Notification">At-Risk Notification</option>
            <option value="Secretary Invitation">Class Secretary Invitation</option>
            <option value="Student Invitation">Student Invitation</option>
            <option value="Other">Other</option>
          </select>
        )}
      </div>

      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              <th className="p-3">Action</th>
              <th className="p-3">Recipients</th>
              <th className="p-3">Status</th>
              <th className="p-3">Date Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((action) => {
              const expanded = open[action.id] === true;
              return (
                <React.Fragment key={action.id}>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                    <td className="p-3 font-medium">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen((prev) => ({ ...prev, [action.id]: !expanded }))}
                        className="flex items-center gap-2 text-left"
                      >
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
                          {action.type}
                        </span>
                      </button>
                    </td>
                    <td className="p-3 font-semibold text-slate-700 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{recipientsLabel(action.recipients)}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {summarizeStatuses(action.recipients).map(({ status, count }) => (
                          <span key={status} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusChipClass(status)}`}>
                            {count} {status.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-slate-500">{formatManilaWhen(action.sentAt)}</td>
                  </tr>
                  {expanded &&
                    action.recipients.map((recipient, index) => (
                      <tr key={`${action.id}-${index}`} className="bg-slate-50/60 dark:bg-slate-900/40">
                        <td className="p-3 pl-10 font-semibold text-slate-700 dark:text-slate-200">{recipient.name}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400">{recipient.email}</td>
                        <td className="p-3" colSpan={2}>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusChipClass(recipient.status)}`}>
                            {recipient.status === 'Suppressed' ? 'Suppressed (test mode)' : recipient.status}
                          </span>
                          {recipient.failureReason && (
                            <span className="ml-2 text-rose-600 dark:text-rose-400">{recipient.failureReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <p className="text-center py-8 text-slate-500 dark:text-slate-400">No email records match your filters.</p>}
      </div>
    </>
  );
};
