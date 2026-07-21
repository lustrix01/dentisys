import React from 'react';
import { Search, Mail } from 'lucide-react';

export type EmailType =
  | 'Privacy Consent'
  | 'At-Risk Notification'
  | 'Class Secretary Invitation'
  | 'Faculty Registration Approved'
  | 'Faculty Registration Rejected';

export type EmailLog = {
  id: string;
  recipient: string;
  subject: string;
  type: EmailType;
  sentAt: string;
  status: 'Sent' | 'Failed' | 'Pending';
};

interface EmailHistoryTableProps {
  logs: EmailLog[];
  search: string;
  onSearch: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
}

export const EmailHistoryTable: React.FC<EmailHistoryTableProps> = ({
  logs,
  search,
  onSearch,
  filter,
  onFilter,
}) => {
  const visible = logs.filter(
    (log) =>
      (filter === 'all' || log.type === filter) &&
      `${log.recipient} ${log.subject} ${log.type}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search recipient, subject, or email type..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500"
          />
        </label>
        <select
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none focus:ring-2 focus:ring-clinical-500 font-semibold"
        >
          <option value="all">All email categories</option>
          <option value="Privacy Consent">Privacy Consent</option>
          <option value="At-Risk Notification">At-Risk Notification</option>
          <option value="Class Secretary Invitation">Class Secretary Invitation</option>
          <option value="Faculty Registration Approved">Faculty Approval Notification</option>
          <option value="Faculty Registration Rejected">Faculty Rejection Notification</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wide">
              <th className="p-3">Recipient</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Category</th>
              <th className="p-3">Date Sent</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                <td className="p-3 font-semibold text-slate-700 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{log.recipient}</span>
                  </div>
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-300">{log.subject}</td>
                <td className="p-3 font-medium">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
                    {log.type}
                  </span>
                </td>
                <td className="p-3 text-slate-500">{log.sentAt}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      log.status === 'Sent'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : log.status === 'Failed'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="text-center py-8 text-slate-400">No email records match your filters.</p>}
      </div>
    </>
  );
};
