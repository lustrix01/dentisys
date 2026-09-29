import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { useThemePreference, type ThemeMode } from '../../hooks/useThemePreference';
import { getFacultyClassesApi } from '../../services/apiClient';

export const Settings: React.FC = () => {
  const { theme, changeTheme } = useThemePreference();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Assigned subjects come from this Faculty member's current-year classes.
  const [subjects, setSubjects] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getFacultyClassesApi()
      .then(res => {
        if (cancelled) return;
        const current = (res.classes || []).filter(cls => cls.isCurrentSchoolYear !== false && cls.isHistorical !== true);
        setSubjects(Array.from(new Set(current.map(cls => cls.courseCode).filter(Boolean))).sort());
      })
      .catch(() => { if (!cancelled) setSubjects([]); });
    return () => { cancelled = true; };
  }, []);

  // Selecting an appearance applies it immediately and saves it to the account.
  const selectTheme = async (mode: ThemeMode) => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      await changeTheme(mode);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? `Appearance applied on this device but not saved to your account: ${err.message}` : 'Appearance could not be saved to your account.');
    } finally {
      setSaving(false);
    }
  };
  return <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">{saveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p>}<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4"><div><h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">My Settings</h1><p className="text-xs text-slate-400 mt-1">Personalize your faculty workspace and review the controls available to your role.</p></div><div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-clinical-650 dark:text-clinical-400 bg-clinical-50 dark:bg-clinical-950/30 px-3 py-2 rounded-xl"><CheckCircle2 className="w-3.5 h-3.5" />Faculty preferences</div></div><div className="grid grid-cols-1 lg:grid-cols-12 gap-5"><div className="lg:col-span-7 space-y-5"><Card className="p-0 overflow-hidden"><CardHeader className="border-b border-slate-100 dark:border-slate-800/80"><CardTitle className="flex items-center gap-2 text-sm"><Sun className="w-4.5 h-4.5 text-clinical-500" />Interface appearance</CardTitle></CardHeader><CardContent className="p-5"><div className="grid grid-cols-2 gap-3">{(['light', 'dark'] as const).map(mode => <button type="button" key={mode} onClick={() => void selectTheme(mode)} aria-pressed={theme === mode} className={`p-4 rounded-xl border text-left transition-all ${theme === mode ? 'border-clinical-500 bg-clinical-50/70 dark:bg-clinical-950/20 shadow-sm' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'}`}><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${theme === mode ? 'bg-clinical-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{mode === 'light' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}</div><p className="mt-3 text-xs font-bold text-slate-700 dark:text-slate-200">{mode === 'light' ? 'Clean light mode' : 'Clinical dark mode'}</p><p className="text-[10px] text-slate-400 mt-1">{theme === mode ? 'Selected appearance' : 'Select this appearance'}</p></button>)}</div><p role="status" className="pt-4 mt-5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">{saving ? 'Saving to your account…' : saved ? 'Appearance saved to your account.' : 'Your choice applies immediately and is saved to your account.'}</p></CardContent></Card></div><div className="lg:col-span-5 space-y-5"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BookOpen className="w-4.5 h-4.5 text-accent-500" />Academic workspace</CardTitle></CardHeader><CardContent><p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Assigned subjects</p><div className="flex flex-wrap gap-2 mt-3">{subjects.length === 0 && <span className="text-[11px] text-slate-400">No classes assigned for the current school year.</span>}{subjects.map(subject => <span key={subject} className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400">{subject}</span>)}</div><p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Use your grade, attendance, and retention workspaces to manage these assigned courses.</p></CardContent></Card></div></div></div>;
};
