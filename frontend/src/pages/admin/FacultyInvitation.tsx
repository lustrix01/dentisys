import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, Search, Send, UserPlus, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/Card';
import { createFacultyInvitation, FacultyInvitation as FacultyInvitationRecord, getFacultyInvitations, reissueFacultyInvitation } from '../../services/apiClient';

export const FacultyInvitation: React.FC = () => {
  const [invitations, setInvitations] = useState<FacultyInvitationRecord[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getFacultyInvitations();
      setInvitations(response.invitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Faculty invitations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredInvitations = useMemo(() => invitations.filter(invitation =>
    invitation.name.toLowerCase().includes(searchQuery.toLowerCase())
    || invitation.email.toLowerCase().includes(searchQuery.toLowerCase())
  ), [invitations, searchQuery]);

  const issueInvitation = async (existing?: FacultyInvitationRecord) => {
    const inviteName = existing?.name ?? name.trim();
    const inviteEmail = existing?.email ?? email.trim();
    if (!inviteName || !inviteEmail) {
      setError('Enter the Faculty member’s name and institutional email.');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = existing
        ? await reissueFacultyInvitation(existing.id)
        : await createFacultyInvitation({ name: inviteName, email: inviteEmail });
      setNotice(response.delivery_status === 'Sent'
        ? `Invitation sent to ${inviteEmail}. The Admin invitation is the approval.`
        : `Invitation created for ${inviteEmail}, but email delivery failed. Check Mailpit or email configuration.`);
      if (!existing) {
        setName('');
        setEmail('');
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue Faculty invitation.');
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const accepted = status === 'Accepted';
    const pending = status === 'Pending';
    const revoked = status === 'Revoked';
    const expired = status === 'Expired';
    const Icon = accepted ? CheckCircle2 : pending ? Clock : revoked ? AlertCircle : Clock;
    const style = accepted
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : pending
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : revoked
          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
          : expired
            ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}><Icon className="h-3 w-3" />{status}</span>;
  };


  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      <div className="border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 sm:text-3xl">Faculty Invitations</h1>
        <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
          Admin invitations authorize Faculty accounts. The invited person sets a password to activate their account; no second approval is needed.
        </p>
      </div>

      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || notice}</span>
        </div>
      )}

      <Card className="p-6">
        <CardHeader className="mb-4 border-b border-slate-100 p-0 pb-4 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5 text-accent-600" />
            <span>Issue New Faculty Invitation</span>
          </CardTitle>
        </CardHeader>
        <form onSubmit={event => { event.preventDefault(); void issueInvitation(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <label className="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-5">
            Faculty name
            <input required value={name} onChange={event => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900" placeholder="Dr. Maria Santos" />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-5">
            Institutional email
            <input
              required
              type="email"
              list="admin-faculty-email-domains"
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
              placeholder="faculty@bicol-u.edu.ph"
            />
            <datalist id="admin-faculty-email-domains">
              <option value={`${email.split('@')[0]}@bicol-u.edu.ph`} />
            </datalist>
          </label>
          <div className="flex items-end sm:col-span-2">
            <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50">
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send invite
            </button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <CardHeader className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 p-0 pb-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-accent-600" />Invitation status</CardTitle>
          <div className="flex gap-2">
            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search Faculty invitations" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search invitations" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800" /></div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-slate-200 px-3 text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300" aria-label="Refresh invitations"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">Faculty</th>
                <th className="px-4 py-3">Institutional email</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading invitations…</td></tr>
                : filteredInvitations.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No Faculty invitations found.</td></tr>
                  : filteredInvitations.map(invitation => (
                    <tr key={invitation.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100">{invitation.name}</td>
                      <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">{invitation.email}</td>
                      <td className="px-4 py-3.5 text-slate-500">{invitation.invitedAt ? new Date(invitation.invitedAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3.5">{statusBadge(invitation.status)}</td>
                      <td className="px-4 py-3.5 text-right">{invitation.status !== 'Accepted' && <button type="button" disabled={sending} onClick={() => void issueInvitation(invitation)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">Reissue</button>}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
