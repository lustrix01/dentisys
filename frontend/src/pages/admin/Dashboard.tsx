import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SchoolYearFilter } from '../../components/SchoolYearFilter';
import { getAdminDashboardKpisApi } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiData, setApiData] = useState<any>(null);
  const [schoolYear, setSchoolYear] = useState('current');

  const loadKpis = () => {
    setLoading(true);
    setError('');
    getAdminDashboardKpisApi(schoolYear)
      .then((res) => {
        setApiData(res);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to connect to backend server.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadKpis();
  }, [schoolYear]);

  const totalStudents = apiData?.kpis?.totalStudents ?? 0;
  const totalFaculty = apiData?.kpis?.totalFaculty ?? 0;
  const goodStanding = apiData?.kpis?.goodStanding ?? 0;
  const atRisk = apiData?.kpis?.atRisk ?? 0;
  const attendanceRate = apiData?.kpis?.attendanceRate;
  // Chart data comes from the server only (ACA-001); empty data shows an empty state.
  const gradeDistribution: Array<{ range: string; count: number }> = (apiData?.gwaBuckets ?? [])
    .map((bucket: { range: string; count: number }) => ({ range: bucket.range, count: Number(bucket.count) || 0 }));
  const standing = [
    { label: 'Good standing', count: Number(apiData?.statusCounts?.active) || 0, color: '#10b981' },
    { label: 'Warning', count: Number(apiData?.statusCounts?.warning) || 0, color: '#f59e0b' },
    { label: 'Remedial', count: Number(apiData?.statusCounts?.remedial) || 0, color: '#f97316' },
    { label: 'Critical', count: Number(apiData?.statusCounts?.critical) || 0, color: '#e11d48' },
  ];
  const classAttendance: Array<{ name: string; rate: number }> = apiData?.classAttendance ?? [];
  const recentAuditEvents: Array<{ id: string; occurredAt: string | null; actorName: string | null; actorEmail: string | null; action: string; description: string; status: string }> =
    apiData?.recentAuditEvents ?? [];
  const hasGrades = gradeDistribution.some(bucket => bucket.count > 0);
  const hasStanding = standing.some(item => item.count > 0);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        Loading administration dashboard data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center space-y-3 max-w-md mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
        <button
          type="button"
          onClick={loadKpis}
          className="px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition-all shadow-md"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      
      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {user?.display_name || 'Dean'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Oversee university faculty email invitations, student attendance logs, system reports, and activity audit trails.
          </p>
        </div>
        <SchoolYearFilter
          value={schoolYear}
          currentSchoolYear={apiData?.currentSchoolYear}
          availableSchoolYears={apiData?.availableSchoolYears}
          onChange={setSchoolYear}
        />
      </div>

      {apiData?.academicTermReminder && <div role="status" className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
        This term ends on {apiData.academicTermReminder.endDate}. Add dates for {apiData.academicTermReminder.semester} {apiData.academicTermReminder.schoolYear}.
        <button type="button" onClick={() => navigate('/admin/settings#academic-terms')} className="ml-2 font-bold underline">Open Academic terms</button>
      </div>}
      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace Column */}
        <div className="lg:col-span-12 space-y-6">
          
          {/* 2. Admin Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Faculty Email Invitations & Operations
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Send email invitations to new faculty members, monitor registered accounts, and analyze audit logs.
                </p>
              </div>

              <button
                onClick={() => navigate('/admin/faculty-invite')}
                className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-accent-600/20 transition-all cursor-pointer flex-shrink-0"
              >
                <span>Invite Faculty</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Consolidated Admin Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Faculty</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {totalFaculty}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {totalStudents}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Good Standing</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  {goodStanding}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">At-Risk Count</span>
                <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400 block mt-0.5">
                  {atRisk}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-lg font-extrabold text-accent-600 dark:text-accent-400 block mt-0.5">
                  {typeof attendanceRate === 'number' ? `${attendanceRate}%` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Charts from the server's dashboard data */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section aria-label="Grade distribution" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Grade distribution</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Graded enrollments by course grade</p>
              <div className="h-48 mt-3">
                {hasGrades ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gradeDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="range" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                      <Tooltip formatter={(value) => [String(value), 'Enrollments']} />
                      <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="h-full flex items-center justify-center text-xs text-slate-400">No graded enrollments for this school year.</p>}
              </div>
            </section>

            <section aria-label="Standing breakdown" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Standing breakdown</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Students by most serious standing</p>
              <div className="h-48 mt-3">
                {hasStanding ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={standing} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                      <Tooltip formatter={(value) => [String(value), 'Students']} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {standing.map(item => <Cell key={item.label} fill={item.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="h-full flex items-center justify-center text-xs text-slate-400">No students for this school year.</p>}
              </div>
            </section>

            <section aria-label="Attendance by class" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attendance by class</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Present, late or excused, as a share of records</p>
              <div className="h-48 mt-3">
                {classAttendance.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classAttendance} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} domain={[0, 100]} />
                      <Tooltip formatter={(value) => [`${String(value)}%`, 'Attendance']} />
                      <Bar dataKey="rate" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="h-full flex items-center justify-center text-xs text-slate-400">No attendance records for this school year.</p>}
              </div>
            </section>
          </div>

          {/* 4. Latest audit events */}
          <section aria-label="Latest audit events" className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest audit events</h3>
              <button type="button" onClick={() => navigate('/admin/audit-trail')} className="text-xs font-bold text-accent-600 hover:underline cursor-pointer">View audit trail</button>
            </div>
            {recentAuditEvents.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">No audit events recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {recentAuditEvents.map(event => (
                  <li key={event.id} className="py-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">{event.actorName || event.actorEmail || 'System'}</span>
                      {event.actorName && event.actorEmail ? <span className="text-slate-400"> ({event.actorEmail})</span> : null}
                      {' — '}{event.description}
                    </span>
                    <span className="text-slate-400 whitespace-nowrap">
                      {event.status} · {event.occurredAt ? new Date(event.occurredAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>

      </div>

    </div>
  );
};
