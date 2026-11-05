import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, MapPin, Navigation, Play } from 'lucide-react';
import { LocationPicker } from './LocationPicker';
import { Modal } from './Modal';
import { RoomSelector, RetiredRoomWarning, useRooms } from './RoomSelector';

import { cleanRadiusText, parseRadius, RADIUS_RANGE_ERROR } from '../utils/geofenceRadius';
import type { ClassMeeting } from '../services/apiClient';
import { SessionTimeFields } from './SessionTimeFields';
import { checkTimes, type TimeSet } from '../utils/sessionTimes';
import { FIXED_TIMES, manilaNow, meetingTimes, pickMeeting, sortMeetings } from '../utils/sessionDefaults';
const RADIUS_HINT = 'Indoors, use 150 m or more; phone GPS is often off by 50–100 m inside buildings.';

const manilaToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

// Tailwind needs literal class names, so each accent lists its full strings.
const ACCENTS = {
  emerald: {
    check: 'accent-emerald-600',
    focus: 'focus:border-emerald-500',
    solid: 'bg-emerald-600',
    shadow: 'shadow-emerald-600/20',
    box: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20',
    outline: 'border-emerald-600 text-emerald-700 dark:text-emerald-300',
  },
  blue: {
    check: 'accent-blue-600',
    focus: 'focus:border-blue-500',
    solid: 'bg-blue-600',
    shadow: 'shadow-blue-600/20',
    box: 'border-blue-200 bg-blue-50/60 dark:border-blue-900/70 dark:bg-blue-950/20',
    outline: 'border-blue-600 text-blue-700 dark:text-blue-300',
  },
} as const;

export interface StartSessionValues {
  sessionDate: string;
  room: string;
  openingTime: string;
  presentCutoff: string;
  lateCutoff: string;
  classEndTime: string;
  biometricRequired: boolean;
  geofenceEnabled: boolean;
  geofenceRadiusMeters: number;
  location: { latitude: number; longitude: number } | null;
}

interface StartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accent: 'emerald' | 'blue';
  /** Content of the "Selected class" box. */
  summary: React.ReactNode;
  /** Runs before the form checks; return a message to stop the submit. */
  precheck?: () => string | null;
  /** Does the API call; throw an Error to show its message in the pop-up. */
  onSubmit: (values: StartSessionValues) => Promise<void>;
  /** 2+ sections turn the "Selected class" box into a picker. */
  sections?: Array<{ id: string; name: string }>;
  selectedSectionId?: string;
  onSelectSection?: (id: string) => void;
  /** The room follows this value whenever it changes. */
  initialRoom?: string;
  /** Development mode: prefilled location, also returned by "Use device location". */
  initialLocation?: { latitude: number; longitude: number } | null;
  note?: React.ReactNode;
  /** The selected class's meetings; they prefill the times and show as chips. */
  meetings?: ClassMeeting[];
}

export const StartSessionModal: React.FC<StartSessionModalProps> = ({
  isOpen, onClose, accent, summary, precheck, onSubmit, sections, selectedSectionId, onSelectSection,
  initialRoom, initialLocation, note, meetings,
}) => {
  const a = ACCENTS[accent];
  const rooms = useRooms();
  const [sessionDate, setSessionDate] = useState(() => manilaToday());
  const [room, setRoom] = useState(initialRoom ?? '');
  const [times, setTimes] = useState<TimeSet>({ ...FIXED_TIMES });
  const [biometricRequired, setBiometricRequired] = useState(true);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [geofenceRadius, setGeofenceRadius] = useState('100');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(initialLocation ?? null);
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fixtureLat = initialLocation?.latitude;
  const fixtureLng = initialLocation?.longitude;
  useEffect(() => { setRoom(initialRoom ?? ''); }, [initialRoom]);
  // Never keep the development fixture once the real location provider is active.
  useEffect(() => {
    setLocation(current => (fixtureLat !== undefined && fixtureLng !== undefined ? current ?? { latitude: fixtureLat, longitude: fixtureLng } : null));
  }, [fixtureLat, fixtureLng]);
  useEffect(() => { if (isOpen) { setError(null); setPickerOpen(false); } }, [isOpen]);

  const sortedMeetings = useMemo(() => sortMeetings(meetings ?? []), [meetings]);
  const meetingsKey = JSON.stringify(sortedMeetings);
  const [chosen, setChosen] = useState<number | null>(null);
  const applyMeeting = (index: number | null) => {
    setChosen(index);
    const picked = index === null ? { ...FIXED_TIMES, room: null } : meetingTimes(sortedMeetings[index]);
    setTimes({ openingTime: picked.openingTime, presentCutoff: picked.presentCutoff, lateCutoff: picked.lateCutoff, classEndTime: picked.classEndTime });
    if (picked.room !== null) setRoom(picked.room);
  };
  // Prefill when the pop-up opens or the class changes, never while typing (S1, S2, S4).
  useEffect(() => {
    if (!isOpen || sortedMeetings.length === 0) { setChosen(null); return; }
    const now = manilaNow();
    const picked = pickMeeting(sortedMeetings, now.day, now.minutes);
    applyMeeting(picked ? sortedMeetings.indexOf(picked) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, meetingsKey]);

  const handleAcquireLocation = () => {
    if (fixtureLat !== undefined && fixtureLng !== undefined) {
      setLocating(true);
      setError(null);
      window.setTimeout(() => { setLocation({ latitude: fixtureLat, longitude: fixtureLng }); setLocating(false); }, 50);
      return;
    }
    if (!navigator.geolocation) {
      setError('Location is not available in this browser. Disable geofencing or use a supported device.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocation({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setLocating(false);
      },
      err => {
        setError(`Unable to acquire the session location: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const blocked = precheck?.();
    if (blocked) { setError(blocked); return; }
    if (!sessionDate || sessionDate < manilaToday()) { setError('Choose today or a future date (Asia/Manila).'); return; }
    const timeProblem = checkTimes(times);
    if (timeProblem) { setError(timeProblem); return; }
    if (geofenceEnabled && !location) {
      setError('Acquire the session location before starting a geofenced session.');
      return;
    }
    if (geofenceEnabled && parseRadius(geofenceRadius) === null) {
      setError(RADIUS_RANGE_ERROR);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        sessionDate, room: room.trim(), ...times,
        biometricRequired, geofenceEnabled, geofenceRadiusMeters: parseRadius(geofenceRadius) ?? 100, location,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the attendance session.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const hasPicker = (sections?.length ?? 0) > 1;
  const boxClass = 'rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50';
  const info = (Tag: 'p' | 'span') => (
    <>
      <Tag className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Selected class</Tag>
      <Tag className="mt-1 block font-bold text-slate-800 dark:text-slate-100">{summary}</Tag>
      <Tag className="mt-0.5 block text-[11px] text-slate-500">Session date: {sessionDate} · Asia/Manila</Tag>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!submitting) { onClose(); setError(null); } }}
      title="Start session"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {hasPicker ? (
          <div>
            <button
              type="button"
              aria-expanded={pickerOpen}
              aria-label="Selected class"
              onClick={() => setPickerOpen(open => !open)}
              className={`flex w-full items-center justify-between text-left ${boxClass}`}
            >
              <span className="block">{info('span')}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {pickerOpen && (
              <div role="listbox" aria-label="Class sections" className="mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {sections!.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    role="option"
                    aria-selected={section.id === selectedSectionId}
                    onClick={() => { onSelectSection?.(section.id); setPickerOpen(false); }}
                    className={`block w-full px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 ${section.id === selectedSectionId ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={boxClass}>{info('p')}</div>
        )}
        {note}

        <label className="block font-bold text-slate-700 dark:text-slate-300">Session date (Asia/Manila)
          <input type="date" required min={manilaToday()} value={sessionDate} onChange={event => setSessionDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" />
        </label>
        <div>
          <label htmlFor="start-session-room" className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Room or session location</label>
          <RoomSelector id="start-session-room" value={room} onChange={setRoom} onPickRoom={picked => {
            // ATT-002: a picked room fills the location and radius; the Faculty still turns the geofence on.
            if (picked.latitude != null && picked.longitude != null) setLocation({ latitude: picked.latitude, longitude: picked.longitude });
            if (picked.radiusMeters != null) setGeofenceRadius(String(picked.radiusMeters));
          }} placeholder="Choose room" fieldClassName={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none ${a.focus} dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`} />
          <div className="mt-2"><RetiredRoomWarning rooms={rooms} names={[room]} /></div>
        </div>

        {sortedMeetings.length > 0 && (
          <div>
            <span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Class meetings</span>
            <div className="flex flex-wrap gap-2">
              {sortedMeetings.map((meeting, index) => (
                <button
                  key={`${meeting.day}-${meeting.component}-${meeting.startTime}-${index}`}
                  type="button"
                  aria-pressed={chosen === index}
                  onClick={() => applyMeeting(index)}
                  className={`rounded-xl border px-3 py-2 text-left font-bold ${chosen === index ? a.outline : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}
                >
                  {meeting.day} · {meeting.component} · {meeting.startTime}–{meeting.endTime} · {meeting.room}
                </button>
              ))}
            </div>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {chosen === null
                ? 'No class meeting today. Pick a meeting or edit the times.'
                : `Times from ${sortedMeetings[chosen].day} · ${sortedMeetings[chosen].component} · ${sortedMeetings[chosen].startTime}–${sortedMeetings[chosen].endTime}. Pick another meeting or edit the times.`}
            </p>
          </div>
        )}

        <SessionTimeFields times={times} onChange={setTimes} sessionDate={sessionDate} endHint="The session ends automatically at this time; students without a record are marked Absent." />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input type="checkbox" checked={biometricRequired} aria-label="Face biometric" onChange={(event) => setBiometricRequired(event.target.checked)} className={a.check} />
            <span><strong className="block text-slate-700 dark:text-slate-200">Face biometric</strong><small className="text-slate-500 dark:text-slate-400">On: students check in with their face. Off: you mark attendance in the roll call.</small></span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <input type="checkbox" checked={geofenceEnabled} aria-label="Geofence" onChange={(event) => setGeofenceEnabled(event.target.checked)} className={a.check} />
            <span><strong className="block text-slate-700 dark:text-slate-200">Geofence</strong><small className="text-slate-500 dark:text-slate-400">Use a configured room radius</small></span>
          </label>
        </div>

        {geofenceEnabled && (
          <div className={`rounded-xl border p-3 ${a.box}`}>
            <div className="flex items-center justify-between gap-3">
              <label className="block flex-1"><span className="mb-1 block font-bold text-slate-700 dark:text-slate-300">Allowed radius (meters)</span><input type="number" min={50} max={2000} value={geofenceRadius} onChange={(event) => setGeofenceRadius(cleanRadiusText(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /><small className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{RADIUS_HINT}</small></label>
              <button type="button" onClick={handleAcquireLocation} disabled={locating} className={`mt-5 inline-flex items-center gap-1.5 rounded-xl ${a.solid} px-3 py-2.5 text-[11px] font-bold text-white disabled:opacity-50`}><Navigation className="w-3.5 h-3.5" />{locating ? 'Locating…' : 'Use device location'}</button>
              <button type="button" onClick={() => setShowMap(shown => !shown)} className={`mt-5 inline-flex items-center gap-1.5 rounded-xl border ${a.outline} px-3 py-2.5 text-[11px] font-bold`}><MapPin className="w-3.5 h-3.5" />{showMap ? 'Hide map' : 'Pick on map'}</button>
            </div>
            {showMap && (
              <div className="relative z-0 mt-3">
                <LocationPicker value={location} radiusMeters={parseRadius(geofenceRadius) ?? 100} onChange={setLocation} />
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{location ? `Location acquired: ${location.latitude}, ${location.longitude}` : 'The server stores the configured session location and radius; Student coordinates remain temporary.'}</p>
          </div>
        )}

        {/* Footer stays pinned to the bottom of the pop-up so Cancel / Start are reachable without scrolling. */}
        <div className="sticky -bottom-4 sm:-bottom-6 z-10 -mx-4 sm:-mx-6 flex justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-950">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={submitting} className={`inline-flex items-center gap-1.5 rounded-xl ${a.solid} px-4 py-2 font-bold text-white shadow-md ${a.shadow} disabled:opacity-50`}><Play className="w-3.5 h-3.5 fill-white" />{submitting ? 'Saving…' : sessionDate > manilaToday() ? 'Schedule session' : 'Start session'}</button>
        </div>
      </form>
    </Modal>
  );
};
