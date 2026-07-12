import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Moon, 
  Sun, 
  RotateCcw, 
  Save, 
  Activity, 
  Percent, 
  ShieldAlert,
  Sliders,
  CheckCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const userStr = localStorage.getItem('dentisys_user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isSecretary = currentUser?.role === 'secretary';

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme);

  // Retention State
  const [retentionThreshold, setRetentionThreshold] = useState<number>(settings.retentionThreshold);

  // Component weights State
  const [quizzes, setQuizzes] = useState<number>(settings.weights.quizzes);
  const [exams, setExams] = useState<number>(settings.weights.exams);
  const [practicum, setPracticum] = useState<number>(settings.weights.practicum);
  const [attendance, setAttendance] = useState<number>(settings.weights.attendance);

  const [isSaved, setIsSaved] = useState(false);

  // Check if weights sum to 100%
  const totalWeight = quizzes + exams + practicum + attendance;
  const isWeightValid = totalWeight === 100;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSecretary) {
      updateSettings({
        ...settings,
        theme,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
      return;
    }

    if (!isWeightValid) {
      alert(`Weights must sum to exactly 100%. Currently they sum to ${totalWeight}%.`);
      return;
    }

    updateSettings({
      retentionThreshold,
      weights: {
        quizzes,
        exams,
        practicum,
        attendance,
      },
      theme,
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResetData = () => {
    if (confirm('Are you sure you want to reset all data back to the default dental students and logs? This will overwrite your localStorage cache.')) {
      localStorage.removeItem('dentisys_students');
      localStorage.removeItem('dentisys_attendance');
      localStorage.removeItem('dentisys_settings');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-clinical-500 animate-spin-slow" />
          {isSecretary ? 'Class Secretary Settings' : 'System Settings Configuration'}
        </h1>
        <p className="text-xs text-slate-400">
          {isSecretary
            ? 'Manage permitted interface preferences and review your assigned access scope'
            : 'Configure theme, grading weight ratios, academic thresholds, and database states'}
        </p>
      </div>

      {isSecretary ? (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-clinical-500" />
                  Interface Theme
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex-1 py-3 px-4 rounded-2xl flex flex-col items-center gap-2 border font-semibold text-xs transition-all ${
                      theme === 'light'
                        ? 'bg-clinical-50/50 border-clinical-500 text-clinical-600 dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <Sun className="w-5 h-5" />
                    <span>Light Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex-1 py-3 px-4 rounded-2xl flex flex-col items-center gap-2 border font-semibold text-xs transition-all ${
                      theme === 'dark'
                        ? 'bg-clinical-950/20 border-clinical-500 text-clinical-400 dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <Moon className="w-5 h-5" />
                    <span>Dark Mode</span>
                  </button>
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm rounded-2xl shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaved ? 'Preference Saved' : 'Save Preference'}</span>
                </button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-clinical-500" />
                  Role Permissions
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  ['Role', currentUser?.title || 'Class Secretary'],
                  ['Assigned Class', currentUser?.assignedClassName || 'Clinical Rotation A'],
                  ['Classroom', currentUser?.classroomName || 'Dental Clinic B - Room 402'],
                  ['CCTV Feed', currentUser?.cctvCameraId || 'CCTV-CLINIC-A-01'],
                ].map(([label, value]) => (
                  <div key={label} className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
                  </div>
                ))}
                <div className="md:col-span-2 p-4 rounded-2xl bg-clinical-500/10 border border-clinical-500/20 text-xs text-clinical-800 dark:text-clinical-300 leading-relaxed">
                  Secretary settings follow least privilege: grading rules, retention thresholds, database reset, and account administration are restricted to authorized faculty or administrators.
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      ) : (
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: UI Options */}
        <div className="lg:col-span-1 space-y-6">
          {/* Theme Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-clinical-500" />
                Interface Theme
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`flex-1 py-3 px-4 rounded-2xl flex flex-col items-center gap-2 border font-semibold text-xs transition-all ${
                    theme === 'light'
                      ? 'bg-clinical-50/50 border-clinical-500 text-clinical-600 dark:bg-slate-900'
                      : 'border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <Sun className="w-5 h-5" />
                  <span>Clean Light Mode</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`flex-1 py-3 px-4 rounded-2xl flex flex-col items-center gap-2 border font-semibold text-xs transition-all ${
                    theme === 'dark'
                      ? 'bg-clinical-950/20 border-clinical-500 text-clinical-400 dark:bg-slate-900'
                      : 'border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <Moon className="w-5 h-5" />
                  <span>Clinical Dark Mode</span>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Retention Threshold */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                Retention Standards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Clinical Course Passing Limit
                </label>
                <select
                  value={retentionThreshold}
                  onChange={(e) => setRetentionThreshold(parseFloat(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                >
                  <option value="2.0">2.0 (Strictest - Outstanding)</option>
                  <option value="2.5">2.5 (Standard Dental Passing)</option>
                  <option value="3.0">3.0 (Lecture/General Passing)</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Students getting grades worse than this threshold (e.g. 2.75 in clinical classes) are automatically flagged for warnings and scheduled for remedial assessments.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Database Control */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                Database Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={handleResetData}
                className="w-full py-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/45 text-rose-600 dark:text-rose-450 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors border border-rose-250/20"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Database Sandbox</span>
              </button>
              <p className="text-[9.5px] text-slate-400 mt-2 text-center">
                Clear all cache states, grades modifications, and reload initial templates.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Grading weights */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-accent-500" />
                Configure Course Component Ratios
              </CardTitle>
              
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                isWeightValid 
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                  : 'bg-rose-105 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
              }`}>
                Sum: {totalWeight}% {isWeightValid ? '(Valid)' : '(Must equal 100%)'}
              </span>
            </CardHeader>

            <CardContent className="py-6 space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Practicum Weight */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Clinical Practicum & Lab weight (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={practicum}
                    onChange={(e) => setPracticum(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                {/* Exam Weight */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Written Examinations weight (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={exams}
                    onChange={(e) => setExams(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                {/* Quizzes Weight */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Quizzes & Assignments weight (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={quizzes}
                    onChange={(e) => setQuizzes(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

                {/* Attendance Weight */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Class Attendance weight (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={attendance}
                    onChange={(e) => setAttendance(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-500"
                  />
                </div>

              </div>

              <div className="p-3.5 bg-clinical-50/50 dark:bg-clinical-950/20 border border-clinical-200/30 dark:border-clinical-900/30 rounded-2xl text-xs text-clinical-650 dark:text-clinical-400 leading-relaxed">
                ℹ️ **Clinical Ratios:** Dental curriculum relies heavily on clinical case operations and lab prosthesis checks. As such, it is recommended to keep **Clinical Practicum** at **40%** or more for realistic grading.
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="submit"
                  disabled={!isWeightValid}
                  className="flex items-center space-x-2 px-6 py-3.5 bg-gradient-to-r from-clinical-500 to-accent-500 hover:from-clinical-600 hover:to-accent-600 text-white font-semibold text-sm rounded-2xl shadow-md transition-all active:scale-97 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaved ? 'Settings Saved Successfully!' : 'Save System Settings'}</span>
                </button>
              </div>

            </CardContent>
          </Card>
        </div>

      </form>
      )}
    </div>
  );
};
