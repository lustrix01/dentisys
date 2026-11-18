import React, { useCallback, useEffect, useState } from 'react';
import { OnOffSwitch } from './ClassJoinPanel';
import { showFeedback } from './FeedbackCenter';
import { OverlapConfirmModal, overlapsFrom, type BookingOverlap } from './OverlapConfirmModal';
import { getAutoSessionsApi, saveAutoSessionsApi, type AutoSessionsSettings } from '../services/apiClient';
import { cleanRadiusText, parseRadius, RADIUS_RANGE_ERROR } from '../utils/geofenceRadius';

type Patch = { enabled?: boolean; biometricRequired?: boolean; geofenceEnabled?: boolean; geofenceRadius?: number };

// ATT-008. Faculty only. A section of the class Edit dialog: box + heading copy "Lecture Venue & Schedule", the radius field
// copies "Lecture Units", hints copy the dialog's grey 10px notes; saves at once (Edit's Save button does not carry it).
export const AutoSessionsPanel: React.FC<{ csId: number }> = ({ csId }) => {
  const [settings, setSettings] = useState<AutoSessionsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState('100');
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<{ overlaps: BookingOverlap[]; patch: Patch } | null>(null);

  const apply = (next: AutoSessionsSettings) => { setSettings(next); setRadius(String(next.geofenceRadius)); setRadiusError(null); };

  const load = useCallback(async () => {
    try {
      setError(null);
      apply(await getAutoSessionsApi(csId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the weekly schedule sessions.');
    }
  }, [csId]);

  useEffect(() => { setSettings(null); void load(); }, [load]);

  const save = async (patch: Patch, confirmOverlap = false) => {
    setBusy(true);
    try {
      apply(await saveAutoSessionsApi({ csId, ...patch, confirmOverlap: confirmOverlap || undefined }));
      setOverlap(null);
    } catch (err) {
      const found = overlapsFrom(err, 'SESSION_OVERLAP');
      if (found) { setOverlap({ overlaps: found, patch }); return; }
      setOverlap(null);
      showFeedback(err instanceof Error ? err.message : 'Could not save the change.', 'error');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveRadius = () => {
    const parsed = parseRadius(radius);
    if (parsed === null) { setRadiusError(RADIUS_RANGE_ERROR); return; }
    if (settings && parsed !== settings.geofenceRadius) void save({ geofenceRadius: parsed });
  };

  if (error) {
    return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>;
  }
  if (!settings) return null;
  const missing = settings.missingRoomLocations;

  return (
    <>
      <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            Sessions from the Weekly Schedule
          </span>
        </div>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <OnOffSwitch label="Create Sessions" on={settings.enabled} disabled={busy} onChange={(enabled) => void save({ enabled })} />
          <OnOffSwitch label="Face Biometric" on={settings.biometricRequired} disabled={busy} onChange={(biometricRequired) => void save({ biometricRequired })} />
          <OnOffSwitch label="Geofence" on={settings.geofenceEnabled} disabled={busy || (missing.length > 0 && !settings.geofenceEnabled)} onChange={(geofenceEnabled) => void save({ geofenceEnabled })} />
        </div>
        {settings.geofenceEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              Radius (m)
              <input
                type="number" min={50} max={2000} value={radius} disabled={busy}
                onChange={(event) => { setRadius(cleanRadiusText(event.target.value)); setRadiusError(null); }}
                onBlur={saveRadius}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveRadius(); } }}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
              />
            </label>
          </div>
        )}
        {radiusError && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{radiusError}</p>}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">DentiSYS keeps sessions for the next 7 days and adds more each day.</p>
        {missing.length > 0 && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Geofence needs a saved location for every meeting room. Ask the Superadmin to set it in Rooms. Missing: {missing.join(', ')}.</p>
        )}
      </div>
      <OverlapConfirmModal
        overlaps={overlap?.overlaps ?? null}
        confirmLabel="Turn on anyway"
        busy={busy}
        onCancel={() => setOverlap(null)}
        onConfirm={() => overlap && void save(overlap.patch, true)}
      />
    </>
  );
};
