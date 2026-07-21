import React, { useEffect, useState } from 'react';
import { CheckCircle2, Moon, Percent, RotateCcw, Save, ShieldAlert, SlidersHorizontal, Sun } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getAdminSettingsApi, updateAdminSettingsApi } from '../../services/apiClient';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  const [theme, setTheme] = useState(settings.theme);
  const [threshold, setThreshold] = useState(settings.retentionThreshold);
  const [weights, setWeights] = useState(settings.weights);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdminSettingsApi()
      .then((res) => {
        if (res.settings) {
          if (res.settings.theme) setTheme(res.settings.theme);
          if (res.settings.retentionThreshold) setThreshold(res.settings.retentionThreshold);
          if (res.settings.weights) setWeights(res.settings.weights);
        }
      })
      .catch(() => {});
  }, []);

  const total = weights.quizzes + weights.exams + weights.practicum + weights.attendance;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (total !== 100) {
      alert(`Weights must total 100%. Current total: ${total}%.`);
      return;
    }
    const newSettings = { theme, retentionThreshold: threshold, weights };
    updateSettings(newSettings);
    try {
      await updateAdminSettingsApi(newSettings);
    } catch (err) {
      console.error('Failed to sync settings with backend', err);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  const reset = () => { if (confirm('Reset the local sandbox data?')) { ['dentisys_students', 'dentisys_attendance', 'dentisys_settings'].forEach(key => localStorage.removeItem(key)); window.location.reload(); } };
  const setWeight = (key: keyof typeof weights, value: number) => setWeights({ ...weights, [key]: value });
  return <div className="space-y-6 animate-fade-in max-w-7xl mx-auto"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4"><div><h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Dean Settings</h1><p className="text-xs text-slate-400 mt-1">Maintain institution-wide academic policy, grading configuration, and sandbox controls.</p></div><div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-3 py-2 rounded-xl"><CheckCircle2 className="w-3.5 h-3.5" />System administration</div></div><form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-5"><div className="lg:col-span-4 space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><SlidersHorizontal className="w-4.5 h-4.5 text-accent-500" />Interface appearance</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2">{(['light', 'dark'] as const).map(mode => <button type="button" onClick={() => setTheme(mode)} key={mode} className={`rounded-xl p-3 text-center border text-[10px] font-bold transition-all ${theme === mode ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400' : 'border-slate-200 dark:border-slate-800 text-slate-400'}`}>{mode === 'light' ? <Sun className="w-4.5 h-4.5 mx-auto mb-1.5" /> : <Moon className="w-4.5 h-4.5 mx-auto mb-1.5" />}{mode === 'light' ? 'Light mode' : 'Dark mode'}</button>)}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldAlert className="w-4.5 h-4.5 text-rose-500" />Retention standard</CardTitle></CardHeader><CardContent><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Clinical passing limit<select value={threshold} onChange={event => setThreshold(Number(event.target.value))} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-200"><option value="2">2.0 — Outstanding</option><option value="2.5">2.5 — Standard dental passing</option><option value="3">3.0 — General passing</option></select></label><p className="mt-3 text-[10px] leading-relaxed text-slate-400">Clinical grades above this limit are included in retention monitoring.</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="w-4.5 h-4.5 text-rose-500" />Sandbox data</CardTitle></CardHeader><CardContent><button type="button" onClick={reset} className="w-full flex justify-center gap-2 text-xs font-bold text-rose-600 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 transition-colors"><RotateCcw className="w-4 h-4" />Reset sandbox data</button><p className="mt-2 text-[10px] text-center text-slate-400">Clears locally stored sample records.</p></CardContent></Card></div><Card className="lg:col-span-8 p-0 overflow-hidden"><CardHeader className="border-b border-slate-100 dark:border-slate-800/80"><CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Percent className="w-4.5 h-4.5 text-accent-500" />Course component ratios</span><span className={`px-2.5 py-1 rounded-lg text-[10px] ${total === 100 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'}`}>Total: {total}% {total === 100 ? 'valid' : 'must equal 100%'}</span></CardTitle></CardHeader><CardContent className="p-5"><p className="text-xs text-slate-400 mb-5">These ratios are used by grade computation throughout the portal.</p><div className="grid sm:grid-cols-2 gap-4">{([['practicum', 'Clinical practicum and laboratory'], ['exams', 'Written examinations'], ['quizzes', 'Quizzes and assignments'], ['attendance', 'Class attendance']] as const).map(([key, label]) => <label key={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}<div className="relative mt-1.5"><input type="number" min="0" max="100" value={weights[key]} onChange={event => setWeight(key, Number(event.target.value) || 0)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100" /><span className="absolute right-3.5 top-2.5 text-xs text-slate-400">%</span></div></label>)}</div><div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end"><button disabled={total !== 100} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed"><Save className="w-4 h-4" />{saved ? 'Settings saved' : 'Save system settings'}</button></div></CardContent></Card></form></div>;
};
