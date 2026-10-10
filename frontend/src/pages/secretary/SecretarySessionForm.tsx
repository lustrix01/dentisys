import React from 'react';
import { Play, Navigation, RefreshCw, MapPin, CheckCircle2, BookOpen, Clock, ShieldCheck, Camera, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/Card';
import { LocationPicker } from '../../components/LocationPicker';
import { SessionTimingFields } from '../../components/SessionTimingFields';
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
type Props = {
  assignedClass: { classId: string; className: string; classroomName: string } | null;
  sessionDate: string; setSessionDate: (value: string) => void;
  customRoom: string; setCustomRoom: (value: string) => void;
  openingTimeStr: string; setOpeningTimeStr: (value: string) => void;
  presentCutoffStr: string; setPresentCutoffStr: (value: string) => void;
  lateCutoffStr: string; setLateCutoffStr: (value: string) => void;
  classEndTimeStr: string; setClassEndTimeStr: (value: string) => void;
  requireFace: boolean; setRequireFace: (value: boolean) => void;
  requireGeo: boolean; setRequireGeo: (value: boolean) => void;
  geofenceRadius: number; setGeofenceRadius: (value: number) => void;
  gpsLocation: { lat: number; lng: number; address: string } | null;
  setGpsLocation: (value: { lat: number; lng: number; address: string }) => void;
  isLocating: boolean; showGpsMap: boolean; setShowGpsMap: React.Dispatch<React.SetStateAction<boolean>>;
  gpsError: string | null; formattedDurationLabel: string; submitting: boolean;
  handleAcquireGps: () => void; handleStartSession: (event: React.FormEvent) => void;
  editing: boolean; error?: string;
};
export const SecretarySessionForm: React.FC<Props> = ({ assignedClass, sessionDate, setSessionDate, customRoom, setCustomRoom, openingTimeStr, setOpeningTimeStr, presentCutoffStr, setPresentCutoffStr, lateCutoffStr, setLateCutoffStr, classEndTimeStr, setClassEndTimeStr, requireFace, setRequireFace, requireGeo, setRequireGeo, geofenceRadius, setGeofenceRadius, gpsLocation, setGpsLocation, isLocating, showGpsMap, setShowGpsMap, gpsError, formattedDurationLabel, submitting, handleAcquireGps, handleStartSession, editing, error }) => (
        <div className="max-w-3xl mx-auto">
          <Card className="p-6">
            <CardHeader className="p-0 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <div className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-blue-600" />
                  <span>Session Configuration</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Section Operations</span>
              </CardTitle>
            </CardHeader>

            <form onSubmit={handleStartSession} className="space-y-5">
              {error && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-300">{error}</p>}
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Session date (Asia/Manila)
                <input type="date" required min={manilaToday()} value={sessionDate} onChange={event => setSessionDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900" />
              </label>


              {/* GPS Location Acquisition Block */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                    <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Secretary Room GPS Location</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAcquireGps}
                    disabled={isLocating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Locating...' : 'Locate My GPS'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGpsMap(shown => !shown)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-600 text-blue-700 dark:text-blue-300 text-[11px] font-bold transition-all cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>{showGpsMap ? 'Hide map' : 'Pick on map'}</span>
                  </button>
                </div>

                {showGpsMap && (
                  <LocationPicker
                    value={gpsLocation ? { latitude: gpsLocation.lat, longitude: gpsLocation.lng } : null}
                    radiusMeters={geofenceRadius}
                    onChange={location => setGpsLocation({
                      lat: location.latitude,
                      lng: location.longitude,
                      address: `Map location (${location.latitude.toFixed(5)}°, ${location.longitude.toFixed(5)}°)`,
                    })}
                  />
                )}

                {gpsError && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">{gpsError}</p>
                )}

                {gpsLocation ? (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800/80 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{gpsLocation.address}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Click &quot;Locate My GPS&quot; to acquire current room position.
                  </div>
                )}
              </div>

              {/* Subject / Section Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <span>Assigned Dentistry Class Section</span>
                </label>
                {assignedClass?.classId ? (
                  <div className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                    <span>{assignedClass.className}</span>
                    <span className="text-xs font-semibold text-slate-400">Section #{assignedClass.classId}</span>
                  </div>
                ) : (
                  <div className="w-full px-4 py-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    No class section is assigned to your Secretary account.
                  </div>
                )}
              </div>

              {/* Room Location */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span>Assigned Classroom / Lab Room</span>
                </label>
                <input
                  type="text"
                  value={customRoom}
                  onChange={(e) => setCustomRoom(e.target.value)}
                  required
                  placeholder="e.g. BU Dental Room 101"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <SessionTimingFields role="secretary" value={{ openingTime: openingTimeStr, presentCutoff: presentCutoffStr, lateCutoff: lateCutoffStr, classEndTime: classEndTimeStr }} onChange={value => { setOpeningTimeStr(value.openingTime); setPresentCutoffStr(value.presentCutoff); setLateCutoffStr(value.lateCutoff); setClassEndTimeStr(value.classEndTime); }} />

              {/* Auto-Calculated Duration Display Badge */}
              <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Total Session Capture Span:
                </span>
                <span className="font-extrabold text-blue-700 dark:text-blue-300 text-sm">{formattedDurationLabel}</span>
              </div>

              {/* Geofence Verification Radius */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  <span>Geofence Verification Radius</span>
                </label>
                <select
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {![100, 200, 500].includes(geofenceRadius) && <option value={geofenceRadius}>{geofenceRadius} meters</option>}
                  <option value={100}>100 meters (Strict Room Radius)</option>
                  <option value={200}>200 meters (BU Dental Building / Room)</option>
                  <option value={500}>500 meters (Campus Wide)</option>
                </select>
              </div>

              {/* Requirement Checkboxes */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Mandatory Check-In Criteria
                </span>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireFace}
                    onChange={(e) => setRequireFace(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-500" />
                      Require Facial Biometrics Scan
                    </span>
                    <p className="text-[11px] text-slate-400">Students must verify webcam face match before recording attendance.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireGeo}
                    onChange={(e) => setRequireGeo(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      Enforce GPS Geofence Verification
                    </span>
                    <p className="text-[11px] text-slate-400">Must be physically within BU Dental Room location boundary.</p>
                  </div>
                </label>
              </div>

              {/* Submit Start Button */}
              <button
                type="submit"
                disabled={submitting || !assignedClass?.classId}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-lg shadow-blue-600/25 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Starting Attendance Session...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white" />
                    <span>{editing ? 'Save changes' : sessionDate > manilaToday() ? 'Schedule Class Session' : 'Start Class Session Now'}</span>
                  </>
                )}
              </button>

            </form>
          </Card>
        </div>
);
