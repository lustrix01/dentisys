import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { useRuntimeConfig } from '../../context/RuntimeConfigContext';
import { validateBicolUEmail } from '../../services/authService';
import {
  createFacultyInvitation,
  type FacultyInvitation as FacultyInvitationRecord,
  getFacultyInvitations,
  reissueFacultyInvitation,
  updateFacultyInvitation,
  revokeFacultyInvitation,
} from '../../services/apiClient';

const PREFIX_OPTIONS = ['', 'Dr.', 'Prof.', 'DMD', 'Mr.', 'Ms.', 'Mrs.'];
const DEFAULT_EMAIL_DOMAIN = 'bicol-u.edu.ph';

function completeInstitutionalEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('@')) return trimmed;
  return `${trimmed}@${DEFAULT_EMAIL_DOMAIN}`;
}

export const FacultyInvitation: React.FC = () => {
  const config = useRuntimeConfig();
  const allowedDomains = useMemo(() => {
    return config.allowed_email_domains;
  }, [config.allowed_email_domains]);

  const [invitations, setInvitations] = useState<FacultyInvitationRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Creation state
  const [prefix, setPrefix] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [email, setEmail] = useState('');

  // Edit modal state
  const [editingInvitation, setEditingInvitation] = useState<FacultyInvitationRecord | null>(null);
  const [editPrefix, setEditPrefix] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editSuffix, setEditSuffix] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editStructuredName, setEditStructuredName] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Revoke modal state
  const [revokingInvitation, setRevokingInvitation] = useState<FacultyInvitationRecord | null>(null);
  const [revoking, setRevoking] = useState(false);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredInvitations = useMemo(() => invitations.filter(invitation =>
    invitation.name.toLowerCase().includes(searchQuery.toLowerCase())
    || invitation.email.toLowerCase().includes(searchQuery.toLowerCase())
  ), [invitations, searchQuery]);

  const emailLocalPart = email.includes('@') ? email.split('@')[0] : email;
  const editEmailLocalPart = editEmail.includes('@') ? editEmail.split('@')[0] : editEmail;

  const handleCreateInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    // The UI presents the institutional suffix by default while still
    // allowing every configured domain and complete email address.
    const cleanEmail = completeInstitutionalEmail(email);

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    if (!cleanFirst || !cleanLast) {
      setError('Please provide at least a first name and a last name.');
      return;
    }

    const emailCheck = validateBicolUEmail(cleanEmail, allowedDomains);
    if (!emailCheck.isValid) {
      setError(emailCheck.message);
      return;
    }

    setSending(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        prefix: prefix.trim() || undefined,
        firstName: cleanFirst,
        middleName: middleName.trim() || undefined,
        lastName: cleanLast,
        suffix: suffix.trim() || undefined,
        email: cleanEmail,
      };

      const response = await createFacultyInvitation(payload);

      setNotice(response.delivery_status === 'Sent'
        ? `Invitation sent to ${cleanEmail}. The Admin invitation authorizes account setup.`
        : `Invitation created for ${cleanEmail}, but email delivery failed. Verify Mailpit or email settings.`);

      setPrefix('');
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setSuffix('');
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue Faculty invitation.');
    } finally {
      setSending(false);
    }
  };

  const openEditModal = (invitation: FacultyInvitationRecord) => {
    setEditingInvitation(invitation);
    setEditError('');
    setEditEmail(invitation.email);

    const hasStructuredName = Boolean(invitation.firstName && invitation.lastName);
    setEditStructuredName(hasStructuredName);
    setEditFullName(hasStructuredName ? '' : invitation.name);
    setEditPrefix(invitation.prefix || '');
    setEditFirstName(invitation.firstName || '');
    setEditMiddleName(invitation.middleName || '');
    setEditLastName(invitation.lastName || '');
    setEditSuffix(invitation.suffix || '');
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingInvitation) return;

    const cleanEmail = completeInstitutionalEmail(editEmail);

    const cleanFullName = editFullName.trim();
    const cleanFirst = editFirstName.trim();
    const cleanLast = editLastName.trim();
    if (editStructuredName && (!cleanFirst || !cleanLast)) {
      setEditError('Please provide at least a first name and a last name.');
      return;
    }
    if (!editStructuredName && !cleanFullName) {
      setEditError('Please provide the faculty member\'s full name.');
      return;
    }

    const emailCheck = validateBicolUEmail(cleanEmail, allowedDomains);
    if (!emailCheck.isValid) {
      setEditError(emailCheck.message);
      return;
    }

    setEditSaving(true);
    setEditError('');
    try {
      const response = await updateFacultyInvitation(editStructuredName
        ? {
            id: editingInvitation.id,
            prefix: editPrefix.trim() || undefined,
            firstName: cleanFirst,
            middleName: editMiddleName.trim() || undefined,
            lastName: cleanLast,
            suffix: editSuffix.trim() || undefined,
            email: cleanEmail,
          }
        : { id: editingInvitation.id, name: cleanFullName, email: cleanEmail });

      setNotice(response.delivery_status === 'Sent'
        ? `Updated invitation sent to ${cleanEmail}. Previous tokens were revoked.`
        : `Invitation updated for ${cleanEmail}, but email delivery failed.`);
      setEditingInvitation(null);
      await refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update Faculty invitation.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingInvitation) return;
    setRevoking(true);
    setError('');
    setNotice('');
    try {
      await revokeFacultyInvitation(revokingInvitation.id);
      setNotice(`Invitation for ${revokingInvitation.name} (${revokingInvitation.email}) was revoked.`);
      setRevokingInvitation(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke Faculty invitation.');
    } finally {
      setRevoking(false);
    }
  };

  const handleReissue = async (invitation: FacultyInvitationRecord) => {
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await reissueFacultyInvitation(invitation.id);
      setNotice(response.delivery_status === 'Sent'
        ? `Invitation sent to ${invitation.email}. The Admin invitation was reissued.`
        : `Invitation reissued for ${invitation.email}, but email delivery failed.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reissue Faculty invitation.');
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
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}>
        <Icon className="h-3 w-3" />
        {status}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      <div className="border-b border-slate-200/80 pb-5 dark:border-slate-800">
        <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 sm:text-3xl">
          Faculty Invitations
        </h1>
        <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
          Admin invitations authorize Faculty accounts. The invited person establishes their password to activate their account; no second approval is needed.
        </p>
      </div>

      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
          }`}
        >
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || notice}</span>
        </div>
      )}

      {/* Creation Card with Structured Names */}
      <Card className="p-6">
        <CardHeader className="mb-4 border-b border-slate-100 p-0 pb-4 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5 text-accent-600" />
            <span>Issue New Faculty Invitation</span>
          </CardTitle>
        </CardHeader>
        <form onSubmit={handleCreateInvitation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                Prefix
                <select
                  value={prefix}
                  onChange={e => setPrefix(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  {PREFIX_OPTIONS.map(p => (
                    <option key={p} value={p}>{p || 'None'}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-3">
                First name *
                <input
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Maria"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                Middle name
                <input
                  value={middleName}
                  onChange={e => setMiddleName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Clara"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-3">
                Last name *
                <input
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Santos"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2">
                Suffix
                <input
                  value={suffix}
                  onChange={e => setSuffix(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  placeholder="DMD, Jr."
                />
              </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-9">
              Institutional email *
              <div className="flex">
                <input
                  required
                  type="text"
                  inputMode="email"
                  list="admin-faculty-create-email-domains"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={`min-w-0 flex-1 border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 ${email.includes('@') ? 'rounded-xl' : 'rounded-l-xl'}`}
                  placeholder={email.includes('@') ? `faculty@${DEFAULT_EMAIL_DOMAIN}` : 'username'}
                />
                {!email.includes('@') && (
                  <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-100 px-3 text-xs font-bold text-accent-700 dark:border-slate-700 dark:bg-slate-800 dark:text-accent-300">
                    @{DEFAULT_EMAIL_DOMAIN}
                  </span>
                )}
              </div>
              <span className="mt-1 block text-[10px] font-medium text-slate-400">
                Enter a local part to use @{DEFAULT_EMAIL_DOMAIN}; other configured domains remain supported.
              </span>
              <datalist id="admin-faculty-create-email-domains">
                {allowedDomains.map(d => (
                  <option key={d} value={emailLocalPart ? `${emailLocalPart}@${d}` : `@${d}`} />
                ))}
              </datalist>
            </label>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={sending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-accent-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send invite
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* Invitation Table */}
      <Card className="p-6">
        <CardHeader className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 p-0 pb-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-accent-600" />
            <span>Invitation status</span>
          </CardTitle>
          <div className="flex gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                aria-label="Search Faculty invitations"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search invitations"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-3 text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              aria-label="Refresh invitations"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading invitations…</td></tr>
              ) : filteredInvitations.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No Faculty invitations found.</td></tr>
              ) : (
                filteredInvitations.map(invitation => (
                  <tr key={invitation.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-800 dark:text-slate-100">{invitation.name}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">{invitation.email}</td>
                    <td className="px-4 py-3.5 text-slate-500">{invitation.invitedAt ? new Date(invitation.invitedAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3.5">{statusBadge(invitation.status)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {invitation.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(invitation)}
                              disabled={sending}
                              className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40 flex items-center gap-1 cursor-pointer"
                              title="Edit pending invitation"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setRevokingInvitation(invitation)}
                              disabled={sending}
                              className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40 flex items-center gap-1 cursor-pointer"
                              title="Revoke invitation"
                            >
                              <Trash2 className="w-3 h-3" />
                              Revoke
                            </button>
                          </>
                        )}
                        {invitation.status !== 'Accepted' && (
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => void handleReissue(invitation)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            Reissue
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Pending Invitation Modal */}
      {editingInvitation && (
        <Modal
          isOpen={true}
          onClose={() => setEditingInvitation(null)}
          title="Edit Pending Faculty Invitation"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {editError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {!editStructuredName ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Faculty name
                  <input
                    required
                    value={editFullName}
                    onChange={e => setEditFullName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
                <p className="text-[11px] text-slate-400">This legacy invitation has one stored display name. It is kept intact; name parts are not guessed.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-3">
                Prefix
                <select
                  value={editPrefix}
                  onChange={e => setEditPrefix(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                >
                  {PREFIX_OPTIONS.map(p => (
                    <option key={p} value={p}>{p || 'None'}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-4">
                First name *
                <input
                  required
                  value={editFirstName}
                  onChange={e => setEditFirstName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-5">
                Middle name
                <input
                  value={editMiddleName}
                  onChange={e => setEditMiddleName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-8">
                Last name *
                <input
                  required
                  value={editLastName}
                  onChange={e => setEditLastName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                />
              </label>

              <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-4">
                Suffix
                <input
                  value={editSuffix}
                  onChange={e => setEditSuffix(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
                  placeholder="DMD, Jr."
                />
              </label>
            </div>
            )}

            <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              Institutional email *
              <div className="flex">
                <input
                  required
                  type="text"
                  inputMode="email"
                  list="admin-faculty-edit-email-domains"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className={`min-w-0 flex-1 border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 ${editEmail.includes('@') ? 'rounded-xl' : 'rounded-l-xl'}`}
                  placeholder={editEmail.includes('@') ? `faculty@${DEFAULT_EMAIL_DOMAIN}` : 'username'}
                />
                {!editEmail.includes('@') && (
                  <span className="flex items-center rounded-r-xl border border-l-0 border-slate-200 bg-slate-100 px-3 text-xs font-bold text-accent-700 dark:border-slate-700 dark:bg-slate-800 dark:text-accent-300">
                    @{DEFAULT_EMAIL_DOMAIN}
                  </span>
                )}
              </div>
              <datalist id="admin-faculty-edit-email-domains">
                {allowedDomains.map(d => (
                  <option key={d} value={editEmailLocalPart ? `${editEmailLocalPart}@${d}` : `@${d}`} />
                ))}
              </datalist>
            </label>

            <p className="text-[11px] text-slate-400">
              Updating a pending invitation revokes all previous security tokens and dispatches an updated invitation link.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingInvitation(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-xl bg-accent-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-accent-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {editSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Revoke Confirmation Modal */}
      {revokingInvitation && (
        <Modal
          isOpen={true}
          onClose={() => setRevokingInvitation(null)}
          title="Revoke Faculty Invitation"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-300">
              <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">Are you sure you want to revoke this invitation?</p>
                <p className="mt-1 leading-relaxed">
                  Revoking the invitation for <strong>{revokingInvitation.name}</strong> ({revokingInvitation.email}) will immediately invalidate their activation link. An audit entry will be recorded.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokingInvitation(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRevoke()}
                disabled={revoking}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {revoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Revoke Invitation
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
