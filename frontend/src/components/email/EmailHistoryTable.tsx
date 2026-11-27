import React, { useState } from 'react';
import { Search, Mail, ChevronRight, Inbox, X } from 'lucide-react';
import { useIsPhone } from '../../hooks/useIsPhone';
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
  color?: 'accent' | 'clinical';
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
  color = 'accent',
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isPhone = useIsPhone();
  const visible = filterEmailActions(actions, search, filter ?? 'all');

  const tableModifier = color === 'clinical' ? 'data-table-ruled-clinical' : '';
  const spineClass =
    color === 'clinical'
      ? 'border-l-clinical-500/80 dark:border-l-clinical-400/70'
      : 'border-l-accent-500/80 dark:border-l-accent-400/70';
  const codeColor =
    color === 'clinical'
      ? 'text-clinical-800 dark:text-clinical-300'
      : 'text-accent-800 dark:text-accent-300';

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search recipient or email type..."
            aria-label="Search email history"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500"
          />
        </label>
        {filter !== undefined && onFilter && (
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            aria-label="Email category"
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500 font-semibold"
          >
            <option value="all">All email categories</option>
            <option value="Privacy Consent">Privacy consent</option>
            <option value="At-Risk Notification">At-risk notification</option>
            <option value="Secretary Invitation">Class Secretary invitation</option>
            <option value="Student Invitation">Student invitation</option>
            <option value="Other">Other</option>
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
          {search.trim() === '' && (filter ?? 'all') === 'all' ? (
            <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          ) : (
            <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          )}
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
            {search.trim() === '' && (filter ?? 'all') === 'all'
              ? 'No emails sent yet.'
              : 'No email records match your filters.'}
          </h3>
          {(search.trim() !== '' || (filter ?? 'all') !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onSearch('');
                onFilter?.('all');
              }}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-clinical-700 hover:bg-clinical-50 dark:text-clinical-300 dark:hover:bg-clinical-950/40"
            >
              <X className="h-3.5 w-3.5" />Clear filters
            </button>
          )}
        </div>
      ) : !isPhone ? (
        <div className={`table-pin table-pin-first data-table-ruled${tableModifier ? ` ${tableModifier}` : ''} hidden sm:block`}>
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th scope="col" className="pl-3.5 pr-2 py-2.5 xl:pl-5 xl:pr-4">Action</th>
                <th scope="col" className="px-2 py-2.5 xl:px-4">Recipients</th>
                <th scope="col" className="border-l border-slate-200/70 px-2 py-2.5 dark:border-slate-800 xl:px-4">Status</th>
                <th scope="col" className="whitespace-nowrap border-l border-slate-200/70 pl-2 pr-3.5 py-2.5 text-right dark:border-slate-800 xl:pl-4 xl:pr-5">Date Sent</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((action) => {
                const expanded = open[action.id] === true;
                return (
                  <React.Fragment key={action.id}>
                    <tr>
                      <td className="whitespace-nowrap pl-3.5 pr-2 py-3 xl:pl-5 xl:pr-4">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setOpen((prev) => ({ ...prev, [action.id]: !expanded }))}
                          className="flex items-center gap-2 text-left"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                          <span className={`whitespace-nowrap font-bold ${codeColor}`}>
                            {action.type}
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-3 font-medium text-slate-800 dark:text-slate-100 xl:px-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{recipientsLabel(action.recipients)}</span>
                        </div>
                      </td>
                      <td className="border-l border-slate-100 px-2 py-3 dark:border-slate-800/80 xl:px-4">
                        <div className="flex flex-wrap gap-1">
                          {summarizeStatuses(action.recipients).map(({ status, count }) => (
                            <span key={status} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusChipClass(status)}`}>
                              {count} {status.toLowerCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-l border-slate-100 pl-2 pr-3.5 py-3 text-right tabular-nums text-slate-600 dark:border-slate-800/80 dark:text-slate-400 xl:pl-4 xl:pr-5">
                        {formatManilaWhen(action.sentAt)}
                      </td>
                    </tr>
                    {expanded &&
                      action.recipients.map((recipient, index) => (
                        <tr key={`${action.id}-${index}`} className="bg-slate-50/60 dark:bg-slate-900/40">
                          <td className="pl-9 pr-2 py-2.5 font-semibold text-slate-700 dark:text-slate-200 xl:pl-11 xl:pr-4">
                            {recipient.name}
                          </td>
                          <td className="break-all px-2 py-2.5 text-slate-500 dark:text-slate-400 xl:px-4">
                            {recipient.email}
                          </td>
                          <td className="border-l border-slate-100 pl-2 pr-3.5 py-2.5 dark:border-slate-800/80 xl:pl-4 xl:pr-5" colSpan={2}>
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
        </div>
      ) : (
        <div className="space-y-2.5 sm:hidden">
          {visible.map((action) => {
            const expanded = open[action.id] === true;
            return (
              <article
                key={action.id}
                className={`rounded-2xl border border-slate-200/90 border-l-[3px] ${spineClass} bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen((prev) => ({ ...prev, [action.id]: !expanded }))}
                    className="flex min-w-0 items-center gap-1.5 text-left"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    <span className={`text-[13px] font-bold leading-snug ${codeColor}`}>
                      {action.type}
                    </span>
                  </button>
                  <div className="flex flex-wrap justify-end gap-1 shrink-0">
                    {summarizeStatuses(action.recipients).map(({ status, count }) => (
                      <span key={status} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusChipClass(status)}`}>
                        {count} {status.toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-slate-50/90 px-2.5 py-2 dark:bg-slate-800/50">
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">Recipients</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="min-w-0 break-words">{recipientsLabel(action.recipients)}</span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400">Date Sent</dt>
                    <dd className="mt-0.5 text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
                      {formatManilaWhen(action.sentAt)}
                    </dd>
                  </div>
                </dl>
                {expanded && (
                  <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800/30">
                    {action.recipients.map((recipient, index) => (
                      <div key={`${action.id}-${index}`} className="py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{recipient.name}</span>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${statusChipClass(recipient.status)}`}>
                            {recipient.status === 'Suppressed' ? 'Suppressed (test mode)' : recipient.status}
                          </span>
                        </div>
                        <p className="mt-0.5 break-all text-slate-500 dark:text-slate-400">{recipient.email}</p>
                        {recipient.failureReason && (
                          <p className="mt-1 text-rose-600 dark:text-rose-400">{recipient.failureReason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
};
