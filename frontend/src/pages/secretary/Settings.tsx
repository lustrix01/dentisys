import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, Moon, Save, ShieldCheck, Sun, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getSecretarySettingsApi, updateSecretarySettingsApi } from '../../services/apiClient';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const [theme, setTheme] = useState(settings.theme);
  const [assignedClassName, setAssignedClassName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    getSecretarySettingsApi()
      .then(res => {
        if (res.settings?.theme) {
          setTheme(res.settings.theme);
        }
        setAssignedClassName(res.settings?.assignedClassName || '');
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Unable to load preferences from server.');
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateSecretarySettingsApi({ theme });
      updateSettings({ ...settings, theme });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Class Secretary Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Set your workspace appearance and review the attendance tools available to your assignment.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Secretary preferences
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading settings...</p>
        </div>
      ) : (
        <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7">
            <Card className="p-0 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sun className="w-4.5 h-4.5 text-blue-500" />
                  Interface appearance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  {(['light', 'dark'] as const).map(mode => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setTheme(mode)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        theme === mode
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${theme === mode ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                        {mode === 'light' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
                      </div>
                      <p className="mt-3 text-xs font-bold text-slate-700 dark:text-slate-200">
                        {mode === 'light' ? 'Light mode' : 'Dark mode'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {theme === mode ? 'Selected appearance' : 'Select this appearance'}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-5 mt-5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/10 disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : saved ? 'Preferences saved' : 'Save preferences'}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ClipboardCheck className="w-4.5 h-4.5 text-blue-500" />
                  Assignment tools
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned class</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    {assignedClassName || 'Not assigned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Manual attendance override</span>
                  <span className="font-bold text-emerald-600">Allowed</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Audit trail review</span>
                  <span className="font-bold text-emerald-600">Allowed</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Camera className="w-4.5 h-4.5 text-blue-500" />
                  Restricted controls
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <ShieldCheck className="w-4 h-4 inline mr-2 text-slate-400" />
                CCTV assignment, academic policy, grading rules, and account management are administrator-controlled.
              </CardContent>
            </Card>
          </div>
        </form>
      )}
    </div>
  );
};

