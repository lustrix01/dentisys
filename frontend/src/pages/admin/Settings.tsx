import React, { useState } from "react";
import {
  CheckCircle2,
  Moon,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/Card";
import { Modal } from "../../components/Modal";
import { useThemePreference } from "../../hooks/useThemePreference";

export const Settings: React.FC = () => {
  // Appearance applies immediately and is saved to the account by changeTheme.
  const { theme, changeTheme } = useThemePreference();
  const [themeError, setThemeError] = useState("");
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  const reset = () => {
    ["dentisys_students", "dentisys_attendance", "dentisys_settings"].forEach(
      (key) => localStorage.removeItem(key),
    );
    setShowResetConfirmation(false);
    window.location.reload();
  };
  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex justify-end pb-2">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/30 px-3 py-2 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          System administration
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <SlidersHorizontal className="w-4.5 h-4.5 text-accent-500" />
                Interface Appearance
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
                  className={`rounded-xl p-3 lg:max-xl:px-2 whitespace-nowrap text-center border text-[10px] font-bold transition-all ${theme === mode ? "border-accent-500 bg-accent-50 dark:bg-accent-950/30 text-accent-700 dark:text-accent-400" : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"}`}
                >
                  {mode === "light" ? (
                    <Sun className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  ) : (
                    <Moon className="w-4.5 h-4.5 mx-auto mb-1.5" />
                  )}
                  {mode === "light" ? "Light mode" : "Dark mode"}
                </button>
              ))}
              <p role="status" className="col-span-2 text-[10px] text-slate-500 dark:text-slate-400">
                {themeError || "Applies immediately and is saved to your account."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlert className="w-4.5 h-4.5 text-rose-500" />
                Grading Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <div data-testid="grading-policy-card" className="space-y-3">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Retention trigger: Grade 2.5.</strong>{" "}
                A completed final course grade from 2.5 through 4.9 (1.0 is highest) is eligible for
                remedial attempts in every course. A 5.0 follows the in-person irregular
                reenrollment path outside DentiSYS.
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
                Browser Cache
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
              <p className="mt-2 text-[10px] text-center text-slate-500 dark:text-slate-400">
                Clears data this browser saved for DentiSYS. Your records are not affected.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-8 p-0 overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80">
              <CardTitle className="flex items-center gap-2 text-sm">
              <SlidersHorizontal className="w-4.5 h-4.5 text-accent-500" />
              Fixed Assessment Transmutation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enabled assessments use (score ÷ maximum score) × 50 + 50.</p>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Present, Late and Excused use the formula; Absent is 0%. Unresolved linked attendance and missing scores remain incomplete.</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Modal
        isOpen={showResetConfirmation}
        onClose={() => setShowResetConfirmation(false)}
        title="Clear Browser Cache"
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
