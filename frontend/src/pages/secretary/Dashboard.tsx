import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CalendarCheck,
  ClipboardPenLine,
  Clock,
  RefreshCw,
  UserCircle,
  Users,
  Video,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getSecretaryDashboardKpisApi } from '../../services/apiClient';

type DashboardData = Awaited<ReturnType<typeof getSecretaryDashboardKpisApi>>;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getSecretaryDashboardKpisApi());
    } catch (requestError) {
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const actions = [
    ['Attendance List', 'Review persisted class attendance.', CalendarCheck, '/secretary/attendance'],
    ['Manual Override', 'Correct a record with a required audit reason.', ClipboardPenLine, '/secretary/override'],
    ['CCTV', 'View integration configuration status.', Video, '/secretary/cctv'],
    ['Profile', 'View account and assigned section.', UserCircle, '/secretary/profile'],
  ] as const;
  const kpiCards = [
    { label: 'Assigned Students', value: data?.kpis.assignedStudents ?? 0, icon: Users, color: 'text-blue-600' },
    { label: 'Attendance Rate', value: `${data?.kpis.attendanceRate ?? 0}%`, icon: CalendarCheck, color: 'text-emerald-600' },
    { label: 'Today Records', value: data?.kpis.todayRecords ?? 0, icon: Clock, color: 'text-blue-600' },
    { label: 'Overrides', value: data?.kpis.overriddenCount ?? 0, icon: AlertCircle, color: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 border-b border-slate-200/40 pb-4 dark:border-slate-800/40 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Class Secretary Portal
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Assigned section: <span className="font-semibold text-blue-600">{data?.assignedClass.className || 'Not assigned'}</span>
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-300">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading scoped dashboard data…</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpiCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="p-4">
                <div className="flex items-center justify-between">
                  <div><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span><span className="mt-1 block text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</span></div>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {actions.map(([title, description, Icon, path]) => (
              <Card key={title} hoverEffect onClick={() => navigate(path)} className="min-h-[160px]">
                <CardContent className="flex h-full flex-col justify-between">
                  <Icon className="h-6 w-6 text-blue-600" />
                  <div><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Recent Class Activity</CardTitle></CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">No persisted attendance activity is available.</div>
              ) : (
                <div className="space-y-3">
                  {data.recentActivity.map((record) => (
                    <div key={record.id} className="flex items-center justify-between rounded-xl border border-slate-200/40 bg-slate-50/70 p-3 dark:border-slate-800/40 dark:bg-slate-900/60">
                      <div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{record.studentName}</p><p className="text-xs text-slate-400">{record.subjectCode} · {record.date}</p></div>
                      <span className="text-xs font-bold capitalize text-slate-600 dark:text-slate-300">{record.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="py-16 text-center text-sm text-slate-400">Dashboard data is unavailable.</div>
      )}
    </div>
  );
};
