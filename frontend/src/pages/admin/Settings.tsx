import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Moon,
  Percent,
  RotateCcw,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/Card";
import { Modal } from "../../components/Modal";
import { useThemePreference } from "../../hooks/useThemePreference";
import {
  getAdminSettingsApi,
  updateAdminSettingsApi,
} from "../../services/apiClient";

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useApp();
  // Appearance applies immediately and saves to the account on its own;
  // the Save button below is for the institution-wide policy only.
  const { theme, changeTheme } = useThemePreference();
  const [themeError, setThemeError] = useState("");
  const [transmutationDefaults, setTransmutationDefaults] = useState(
    settings.transmutationDefaults ?? { minimumPercentage: 50, maximumPercentage: 100 },
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  useEffect(() => {
    getAdminSettingsApi()
      .then((res) => {
        if (res.settings) {
          if (res.settings.transmutationDefaults) setTransmutationDefaults(res.settings.transmutationDefaults);
        }
      })
      .catch(() => {});
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (transmutationDefaults.minimumPercentage < 0
      || transmutationDefaults.maximumPercentage > 100
      || transmutationDefaults.minimumPercentage > transmutationDefaults.maximumPercentage) {
      setError('Transmutation bounds must be between 0% and 100%, with minimum not exceeding maximum.');
      return;
    }
    try {
      await updateAdminSettingsApi({ theme, transmutationDefaults });
      updateSettings({ ...settings, theme, transmutationDefaults });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to sync settings with backend", err);
      setError(
        err instanceof Error ? err.message : "Failed to save system settings.",
      );
    }
  };
  const reset = () => {
    ["dentisys_students", "dentisys_attendance", "dentisys_settings"].forEach(
      (key) => localStorage.removeItem(key),
    );
    setShowResetConfirmation(false);
    window.location.reload();
  };
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            My Settings
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Appearance, assessment transmutation defaults, and local cache controls.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          System administration
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}
      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="w-4.5 h-4.5 text-accent-500" />
                Interface appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  type="button"
                  onClick={() => {
                    setThemeError("");
                    changeTheme(mode).catch((err) =>
                      setThemeError(
                        err instanceof Error
                          ? `Appearance applied on this device but not saved to your account: ${err.message}`
                          : "Appearance could not be saved to your account.",
                      ),
                    );
                  }}
                  aria-pressed={theme === mode}
                  key={mode}
                  className={`rounded-xl p-3 text-center border text-[10px] font-bold transition-all ${theme === mode ? "border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400" : "border-slate-200 dark:border-slate-800 text-slate-400"}`}
                >
                  {mode === "light" ? (
                    <Sun className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  ) : (
                    <Moon className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  )}
                  {mode === "light" ? "Light mode" : "Dark mode"}
                </button>
              ))}
              <p role="status" className="col-span-2 text-[10px] text-slate-400">
                {themeError || "Applies immediately and is saved to your account."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="w-4.5 h-4.5 text-rose-500" />
                Grading policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <div data-testid="grading-policy-card" className="space-y-3">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Retention trigger: GWA 2.5.</strong>{" "}
                A final course grade of 2.5 or worse (1.0 is highest, 5.0 is failing) places the
                Student under retention monitoring and makes the course eligible for a remedial
                attempt. This is fixed college policy and applies to every course.
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Grade weights</strong> are set
                for each course by its Faculty in Grade Computation. A class cannot be graded until
                its course has saved grade weights.
              </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <RotateCcw className="w-4.5 h-4.5 text-rose-500" />
                Compatibility cache
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                onClick={() => setShowResetConfirmation(true)}
                className="w-full flex justify-center gap-2 text-xs font-bold text-rose-600 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Clear local cache
              </button>
              <p className="mt-2 text-[10px] text-center text-slate-400">
                The database remains unchanged.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-8 p-0 overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Percent className="w-4.5 h-4.5 text-accent-500" />
              Assessment transmutation defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div>
              <p className="text-[10px] text-slate-400 mb-4">New assessments start with these bounded transformation values.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {([
                  ['minimumPercentage', 'Minimum percentage'],
                  ['maximumPercentage', 'Maximum percentage'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {label}
                    <div className="relative mt-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={transmutationDefaults[key]}
                        onChange={(event) => setTransmutationDefaults({ ...transmutationDefaults, [key]: Number(event.target.value) || 0 })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-100"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">%</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saved ? "Settings saved" : "Save system settings"}
              </button>
            </div>
          </CardContent>
        </Card>
      </form>
      <Modal
        isOpen={showResetConfirmation}
        onClose={() => setShowResetConfirmation(false)}
        title="Clear compatibility cache"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Clear locally cached compatibility data? Persisted database records
          will not be changed.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowResetConfirmation(false)}
            className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
          >
            Clear cache
          </button>
        </div>
      </Modal>
    </div>
  );
};
