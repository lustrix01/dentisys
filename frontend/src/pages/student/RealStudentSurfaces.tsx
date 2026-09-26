import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  UserCircle,
  Camera,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { MfaSettingsCard } from '../../components/MfaSettingsCard';
import { PasswordChangeCard } from '../../components/PasswordChangeCard';
import { GoogleLinkCard } from '../../components/GoogleLinkCard';
import {
  getStudentAcademicDashboardApi,
  getStudentAcademicProfileApi,
} from '../../services/apiClient';
import type {
  StudentAcademicDashboardResponse,
  StudentAcademicProfile,
} from '../../types';

export const StudentUnavailable: React.FC<{ title: string }> = ({ title }) => (
  <div className="max-w-3xl mx-auto pt-6 animate-fade-in" role="status">
    <Card className="p-8 border-amber-200/70 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
      <ShieldCheck className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      <h1 className="mt-4 font-heading font-extrabold text-2xl text-amber-950 dark:text-amber-100">{title}</h1>
      <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
        Academic services are currently unavailable. Please try again later.
      </p>
    </Card>
  </div>
);

export function StudentIdentityFields({ profile }: { profile?: StudentAcademicProfile | null }) {
  const { user } = useAuth();
  const student = user?.student;

  const displayName = profile?.name || user?.display_name || '—';
  const loginEmail = user?.login_email || profile?.account?.email || '—';
  const studentNum = student?.student_number || profile?.studentNumber || '—';
  const studentStatus = profile?.status || student?.status || '—';
  const initials = displayName === '—' ? '—' : displayName.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Card className="p-6 space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 border-b border-slate-100 dark:border-slate-800 pb-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-blue-500/20 shrink-0">{initials}</div>
        <div className="space-y-1.5 flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100 break-words">{displayName}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{loginEmail}</p>
          <span className="inline-flex px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[11px] font-bold">Student · {studentNum}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        {profile && [
          ['Prefix', profile.prefix],
          ['First Name', profile.firstName],
          ['Middle Name', profile.middleName],
          ['Last Name', profile.lastName],
          ['Suffix', profile.suffix],
        ].map(([label, value]) => (
          <div key={label} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{label}</span>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm break-words">{value || '—'}</p>
          </div>
        ))}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</span>
          <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{displayName}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Login email</span>
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm break-all">{loginEmail}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student number</span>
          <p className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">{studentNum}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student status</span>
          <p className="font-bold capitalize text-slate-800 dark:text-slate-100 text-sm">{studentStatus}</p>
        </div>
      </div>
    </Card>
  );
}

export const RealStudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<StudentAcademicDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentAcademicDashboardApi();
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load student dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading student dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto pt-6 animate-fade-in" role="alert">
        <Card className="p-6 border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="font-bold text-base text-rose-950 dark:text-rose-100">Unable to load Student Dashboard</h2>
              <p className="text-xs text-rose-800 dark:text-rose-300">{error || 'Failed to read academic records.'}</p>
              <button
                type="button"
                onClick={() => void loadData()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { student, summary, classes } = data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Welcome back, {student.name}!
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Monitor your clinical attendance, academic progress, and retention standing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{student.studentNumber || '—'}</span>
          </div>
          <button
            onClick={() => navigate('/student/attendance')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Daily Check-In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">Student Workspace</span>
          <h2 className="text-xl font-bold font-heading text-slate-800 dark:text-slate-100 mt-0.5">Academic Progress Overview</h2>
        </div>
      {/* Summary KPI Cards (Preserves nulls without converting to 0!) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Enrolled Classes
          </span>
          <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">
            {summary.classCount}
          </span>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Overall GWA
          </span>
          <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 block mt-1">
            {typeof summary.gwa === 'number' ? summary.gwa.toFixed(2) : '—'}
          </span>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Attendance Rate
          </span>
          <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 block mt-1">
            {typeof summary.attendanceRate === 'number' ? `${summary.attendanceRate}%` : '—'}
          </span>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Clinical Hours
          </span>
          <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 block mt-1">
            {summary.clinicalHoursCompleted} hrs
          </span>
        </Card>

        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Retention Alerts
          </span>
          <span
            className={`text-2xl font-extrabold block mt-1 ${
              summary.retentionAlerts > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'
            }`}
          >
            {summary.retentionAlerts}
          </span>
        </Card>
      </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold font-heading text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ['Academic Roster', 'Enrolled Courses', 'View schedule and grades', '/student/classes'],
            ['Audit Trail', 'Attendance Logs', 'Full historical log entries', '/student/attendance-logs'],
            ['Biometrics', 'Face Registration', 'Enroll or update face model', '/student/face-registration'],
          ].map(([label, title, description, path]) => (
            <button key={path} onClick={() => navigate(path)} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/80 hover:border-blue-500/50 hover:shadow-xs transition-all text-left group cursor-pointer">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">{label}</span>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mt-1 group-hover:text-blue-600 transition-colors">{title}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Active Classes Table */}
      <Card className="p-0 overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>Enrolled Subjects & Academic Standing</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/student/classes')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View Full Grades →
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {classes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No active course enrollments recorded for this term.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Section</th>
                    <th className="py-3 px-4 text-center">Units</th>
                    <th className="py-3 px-4 text-center">Grade</th>
                    <th className="py-3 px-4 text-center">Score %</th>
                    <th className="py-3 px-4 text-center">Retention Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classes.map((cls) => {
                    const isAtRisk = ['warning', 'critical', 'remedial'].includes(cls.retentionState?.toLowerCase());
                    return (
                      <tr key={cls.enrollmentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 mr-2">
                            {cls.courseCode}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{cls.courseName}</span>
                          {cls.isClinical && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60">
                              Clinical
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{cls.className}</td>
                        <td className="py-3 px-4 text-center font-bold">{cls.units}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          {cls.grade !== null ? cls.grade.toFixed(2) : (
                            <span className="text-slate-400 font-normal">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {cls.percentage !== null ? `${cls.percentage}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              isAtRisk
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/60'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60'
                            }`}
                          >
                            {cls.retentionState || 'Good Standing'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      <div className="lg:col-span-4 space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-xs font-bold font-heading text-slate-800 dark:text-slate-100 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3">Verification Steps</h3>
          <div className="space-y-3 text-xs">
            {[
              ['Step 1: Select Class', 'Choose your enrolled subject in Daily Attendance.'],
              ['Step 2: Session Check', 'Check the active session and its room location.'],
              ['Step 3: Geofence & Face', 'Allow location and camera access, then follow the verification instructions.'],
            ].map(([title, description]) => (
              <div key={title} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">{title}</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/student/attendance')} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"><Camera className="w-4 h-4" />Go to Attendance Check-In</button>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" /><h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Designated Attendance Location</h4></div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">Check the session's location before checking in. Contact your Secretary or Faculty for authorized manual attendance assistance.</p>
        </div>
      </div>
      </div>
    </div>
  );
};

export const RealStudentProfile: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StudentAcademicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentAcademicProfileApi();
      setProfile(res.profile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load authoritative profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 text-center text-sm font-semibold text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-600" />
        Loading student profile…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-slate-100">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          View your personal enrollment record and account security settings.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <StudentIdentityFields profile={profile} />

          {/* Academic Registry Records */}
          <Card className="p-6 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Academic Registry Details
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Institutional Email</span>
                <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm break-all">{profile?.email || '—'}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact Number</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{profile?.contact || '—'}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Year Level</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {profile?.yearLevel ? `Year ${profile.yearLevel}` : '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sex</span>
                <p className="font-bold capitalize text-slate-800 dark:text-slate-100 text-sm">{profile?.sex || '—'}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Admission Date</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{profile?.admissionDate || '—'}</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Date of Birth</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{profile?.birthdate || '—'}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <MfaSettingsCard userEmail={profile?.email || user?.login_email} roleName="Student" />
          <GoogleLinkCard />
          <PasswordChangeCard />
        </div>
      </div>
    </div>
  );
};
