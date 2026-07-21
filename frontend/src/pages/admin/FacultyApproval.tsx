import React, { useState, useMemo, useEffect } from 'react';
import {
  UserCheck,
  UserX,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Mail,
  ShieldCheck,
  Filter,
  RefreshCw,
  AlertTriangle,
  GraduationCap,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { Modal } from '../../components/Modal';
import {
  fetchFacultyRegistrationRequests,
  approveFacultyAccount,
  rejectFacultyAccount,
  RegisteredUser,
} from '../../services/authService';

export const FacultyApproval: React.FC = () => {
  const [facultyList, setFacultyList] = useState<RegisteredUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending Approval' | 'Active' | 'Rejected'>('all');
  
  const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    const list = await fetchFacultyRegistrationRequests();
    setFacultyList(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered list
  const filteredList = useMemo(() => {
    return facultyList.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [facultyList, search, statusFilter]);

  // Status counts
  const stats = useMemo(() => {
    return {
      pending: facultyList.filter((u) => u.status === 'Pending Approval').length,
      active: facultyList.filter((u) => u.status === 'Active').length,
      rejected: facultyList.filter((u) => u.status === 'Rejected').length,
      total: facultyList.length,
    };
  }, [facultyList]);

  const handleOpenActionModal = (user: RegisteredUser, action: 'approve' | 'reject') => {
    setSelectedUser(user);
    setActionType(action);
    setIsModalOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedUser || !actionType) return;
    setIsProcessing(true);

    try {
      if (actionType === 'approve') {
        const res = await approveFacultyAccount(selectedUser.email);
        if (res.success) {
          setNotice({ type: 'success', message: res.message });
        } else {
          setNotice({ type: 'error', message: res.message });
        }
      } else {
        const res = await rejectFacultyAccount(selectedUser.email);
        if (res.success) {
          setNotice({ type: 'success', message: res.message });
        } else {
          setNotice({ type: 'error', message: res.message });
        }
      }

      loadData();
      setIsModalOpen(false);
      setSelectedUser(null);
      setActionType(null);
    } catch (err) {
      setNotice({ type: 'error', message: 'Failed to process request.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-100/80 dark:bg-accent-950/50 text-accent-800 dark:text-accent-300 text-xs font-bold uppercase tracking-wider mb-1.5">
            <ShieldCheck className="w-4 h-4 text-accent-600" /> Dean Administration
          </div>
          <h2 className="text-3xl font-heading font-bold text-slate-800 dark:text-slate-100">
            Faculty Approval Management
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review, approve, or reject Faculty account registration requests. Approved faculty members gain immediate portal access.
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 shadow-sm shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh List
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-semibold animate-in fade-in ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span>{notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Approval</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-2">{stats.pending}</p>
          <p className="text-[11px] text-slate-400 mt-1">Requires Dean review</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approved & Active</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 mt-2">{stats.active}</p>
          <p className="text-[11px] text-slate-400 mt-1">Active faculty members</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rejected Requests</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-3xl font-extrabold text-rose-600 mt-2">{stats.rejected}</p>
          <p className="text-[11px] text-slate-400 mt-1">Registration denied</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-accent-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Requests</span>
            <GraduationCap className="w-4 h-4 text-accent-500" />
          </div>
          <p className="text-3xl font-extrabold text-accent-600 dark:text-accent-400 mt-2">{stats.total}</p>
          <p className="text-[11px] text-slate-400 mt-1">All faculty accounts</p>
        </Card>
      </div>

      {/* Main Content Table Card */}
      <Card className="p-0 overflow-hidden">
        {/* Search & Filter Bar */}
        <div className="p-5 flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by faculty name or email address..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-accent-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto overflow-x-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            {(['all', 'Pending Approval', 'Active', 'Rejected'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {filter === 'all' ? 'All Requests' : filter}
              </button>
            ))}
          </div>
        </div>

        {/* Requests Table */}
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
              <tr className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                <th className="p-4">Faculty Member</th>
                <th className="p-4">Official BU Email</th>
                <th className="p-4">Registration Date</th>
                <th className="p-4">Account Status</th>
                <th className="p-4 text-right">Dean Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredList.map((user) => {
                const regDate = new Date(user.createdAt).toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent-100 dark:bg-accent-950/60 text-accent-700 dark:text-accent-300 font-bold flex items-center justify-center text-xs shadow-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">{user.name}</p>
                          <p className="text-[11px] text-slate-400">{user.title}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-medium text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{user.email}</span>
                      </div>
                    </td>

                    <td className="p-4 text-slate-500 dark:text-slate-400">{regDate}</td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          user.status === 'Active'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : user.status === 'Rejected'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse'
                        }`}
                      >
                        {user.status === 'Active' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {user.status === 'Rejected' && <XCircle className="w-3.5 h-3.5" />}
                        {user.status === 'Pending Approval' && <Clock className="w-3.5 h-3.5" />}
                        {user.status}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      {user.status === 'Pending Approval' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenActionModal(user, 'approve')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => handleOpenActionModal(user, 'reject')}
                            className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {user.status === 'Active' ? 'Approved by Dean' : 'Rejected by Dean'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredList.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-semibold text-sm">No faculty registration requests found matching your filters.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Confirmation Action Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={actionType === 'approve' ? 'Approve Faculty Registration' : 'Reject Faculty Registration'}
        size="md"
      >
        {selectedUser && (
          <div className="space-y-4 text-slate-700 dark:text-slate-300">
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3 ${
                actionType === 'approve'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40'
              }`}
            >
              {actionType === 'approve' ? (
                <UserCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <UserX className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h4
                  className={`font-bold text-sm ${
                    actionType === 'approve' ? 'text-emerald-900 dark:text-emerald-200' : 'text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {actionType === 'approve' ? 'Confirm Account Approval' : 'Confirm Account Rejection'}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {actionType === 'approve'
                    ? `Are you sure you want to approve faculty registration for ${selectedUser.name} (${selectedUser.email})? This will activate their account and send an approval notification.`
                    : `Are you sure you want to reject faculty registration for ${selectedUser.name} (${selectedUser.email})? They will be unable to log in and a rejection notice will be sent.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isProcessing}
                className={`px-4 py-2 rounded-xl font-bold text-xs text-white flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                  actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : actionType === 'approve' ? (
                  'Confirm & Approve'
                ) : (
                  'Confirm & Reject'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
