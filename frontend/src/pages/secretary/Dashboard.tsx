import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Play, AlertCircle } from 'lucide-react';
import { SchoolYearFilter } from '../../components/SchoolYearFilter';
import { getSecretaryActiveAttendanceSessionApi, getSecretaryDashboardKpisApi, type SecretaryAttendanceSession } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

type DashboardData = Awaited<ReturnType<typeof getSecretaryDashboardKpisApi>>;

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState<SecretaryAttendanceSession | null>(null);
  const [sessionStatusError, setSessionStatusError] = useState(false);
  const [schoolYear, setSchoolYear] = useState('current');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const dashboard = await getSecretaryDashboardKpisApi(schoolYear);
      setData(dashboard);
      const csId = Number(dashboard.assignedClass?.classId);
      if (Number.isFinite(csId) && csId > 0) {
        try {
          setActiveSession((await getSecretaryActiveAttendanceSessionApi(csId)).activeSession);
          setSessionStatusError(false);
        } catch {
          setActiveSession(null);
          setSessionStatusError(true);
        }
      } else {
        setActiveSession(null);
        setSessionStatusError(false);
      }
    } catch (requestError) {
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [schoolYear]);

  const assignedStudentsCount = data?.kpis.assignedStudents ?? 0;
  const attendanceRateVal = data?.kpis.attendanceRate;
  const todayRecordsVal = data?.kpis.todayRecords ?? 0;
  const overriddenVal = data?.kpis.overriddenCount ?? 0;
  const assignedClassName = data?.assignedClass?.className || 'No Section Assigned';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}
      
      {/* 1. Clean Top Header with Highlighted Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {user?.display_name || 'Class Secretary'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Manage section attendance registers, start live class sessions, and submit manual overrides.
          </p>
        </div>
        <SchoolYearFilter
          value={schoolYear}
          currentSchoolYear={data?.currentSchoolYear}
          availableSchoolYears={data?.availableSchoolYears}
          onChange={setSchoolYear}
        />

        {/* Highlighted Primary CTA Button */}
        <button
          onClick={() => navigate('/secretary/start-session')}
          className="flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Start Class Session</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Workspace Column (Spans 8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* 2. Secretary Workspace Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
              <div>
                <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">
                  Section Operations & Attendance Tracking
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-lg leading-relaxed">
                  Review student check-in entries, perform manual attendance overrides with audit logging, and verify section attendance status.
                </p>
              </div>

              <button
                onClick={() => navigate('/secretary/attendance')}
                className="self-start sm:self-center flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer flex-shrink-0"
              >
                <span>Attendance List</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Consolidated Secretary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Section</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {assignedClassName}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Enrolled Students</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {assignedStudentsCount}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 block mt-0.5">
                  {typeof attendanceRateVal === 'number' ? `${attendanceRateVal}%` : '—'}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Records</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {todayRecordsVal}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Overrides</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 block mt-0.5">
                  {overriddenVal}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Sidebar Panel (Spans 4) */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Section Overview */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Assigned Section
              </h3>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                {assignedClassName}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Assigned Section
                </span>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">
                  {data?.assignedClass?.className || assignedClassName}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Section ID: {data?.assignedClass?.classId || '—'}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Assigned Room
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                  {data?.assignedClass?.classroomName || 'TBA'}
                </p>
              </div>
            </div>
          </div>

          {/* Live attendance session */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Attendance Session
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeSession ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300' : 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                {activeSession ? 'Live' : 'None active'}
              </span>
            </div>
            {sessionStatusError ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">Session status is unavailable right now.</p>
            ) : activeSession ? (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1 text-xs">
                <h4 className="font-bold text-slate-800 dark:text-slate-100">{activeSession.sessionCode}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Started {new Date(activeSession.startedAt).toLocaleString()}{activeSession.room ? ` · ${activeSession.room}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/secretary/start-session')}
                  className="mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Open live session →
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">No attendance session is running for your section.</p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
