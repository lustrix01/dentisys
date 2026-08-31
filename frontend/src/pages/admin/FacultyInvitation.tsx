import React, { useState } from 'react';
import { 
  Mail, 
  UserPlus, 
  Send, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Users, 
  Search
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/Card';

export interface FacultyInvitationItem {
  id: string;
  name: string;
  email: string;
  invitedAt: string;
  status: 'pending' | 'registered';
}

const INITIAL_INVITATIONS: FacultyInvitationItem[] = [
  { id: '1', name: 'Dr. Roberto Santos, DMD', email: 'rsantos@bicol-u.edu.ph', invitedAt: '2026-08-28 09:30 AM', status: 'registered' },
  { id: '2', name: 'Dr. Fernando Cruz, DMD', email: 'fcruz@bicol-u.edu.ph', invitedAt: '2026-08-29 02:15 PM', status: 'registered' },
  { id: '3', name: 'Dr. Angela Reyes, DMD', email: 'areyes@bicol-u.edu.ph', invitedAt: '2026-08-30 10:00 AM', status: 'pending' },
];

export const FacultyInvitation: React.FC = () => {
  const [invitations, setInvitations] = useState<FacultyInvitationItem[]>(INITIAL_INVITATIONS);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.endsWith('@bicol-u.edu.ph')) {
      alert('Please enter a valid Bicol University email address (@bicol-u.edu.ph).');
      return;
    }

    setIsSending(true);

    setTimeout(() => {
      const newInvite: FacultyInvitationItem = {
        id: Date.now().toString(),
        name: name.trim() || 'Faculty Member',
        email: email.trim().toLowerCase(),
        invitedAt: new Date().toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        status: 'pending'
      };

      setInvitations([newInvite, ...invitations]);
      setName('');
      setEmail('');
      setIsSending(false);
      setNotification({
        type: 'success',
        message: `Official faculty invitation email dispatched to ${newInvite.email}! They can now sign up using Google or System Registration.`
      });
    }, 600);
  };

  const handleResend = (inv: FacultyInvitationItem) => {
    setNotification({
      type: 'info',
      message: `Re-sent faculty invitation email to ${inv.email}.`
    });
  };

  const filteredInvitations = invitations.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Faculty Email Invitations
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Send official invitations to Bicol University College of Dental Medicine faculty members to allow them to register via Google or System Sign-Up.
          </p>
        </div>
      </div>

      {notification && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-semibold animate-fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
            : 'bg-blue-500/10 text-blue-800 dark:text-blue-300 border-blue-500/20'
        }`}>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* 2. Top Invite Form */}
      <Card className="p-6">
        <CardHeader className="p-0 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-accent-600" />
            <span>Send New Faculty Email Invitation</span>
          </CardTitle>
        </CardHeader>

        <form onSubmit={handleSendInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-5 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Faculty Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Maria Santos, DMD"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          <div className="sm:col-span-5 space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Official BU Email <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="faculty@bicol-u.edu.ph"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={isSending}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-accent-600 hover:bg-accent-700 active:scale-[0.99] transition-all shadow-md shadow-accent-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Invite</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Card>

      {/* 3. Sent Invitations History */}
      <Card className="p-6">
        <CardHeader className="p-0 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5 text-accent-600" />
            <span>Faculty Invitation History & Status</span>
          </CardTitle>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search faculty invitations..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-4">BU Email Address</th>
                <th className="py-3 px-4">Date Invited</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {filteredInvitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100">
                    {inv.name}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                    {inv.email}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400">
                    {inv.invitedAt}
                  </td>
                  <td className="py-3.5 px-4">
                    {inv.status === 'registered' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Registered & Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold">
                        <Clock className="w-3 h-3 text-amber-500" />
                        Invitation Pending
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {inv.status === 'pending' && (
                      <button
                        onClick={() => handleResend(inv)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-accent-600 hover:text-white dark:hover:bg-accent-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                      >
                        Resend Invite
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
