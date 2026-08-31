import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Navigation,
  Sparkles,
  RefreshCw,
  History,
  Clock,
  UserCheck,
  Building,
  User,
  ChevronDown,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

// Geofence center (Bicol University Dental Clinic)
const BU_DENTAL_CLINIC_COORDS = {
  lat: 13.1436,
  lng: 123.7438,
  maxDistanceKm: 0.2 // 200m
};

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface ClassSessionInfo {
  code: string;
  name: string;
  room: string;
  schedule: string;
  instructor: string;
  status: 'active' | 'no_session' | 'ended';
  statusMessage: string;
}

const MOCK_CLASS_SESSIONS: Record<string, ClassSessionInfo> = {
  CLIN401: {
    code: 'CLIN401',
    name: 'Restorative Dentistry Lab',
    room: 'BU Dental Clinic — Room 101',
    schedule: '08:00 AM - 12:00 PM (Today)',
    instructor: 'Dr. Roberto Santos, DMD',
    status: 'active',
    statusMessage: 'Session is currently ACTIVE and open for attendance check-in.'
  },
  PROS402: {
    code: 'PROS402',
    name: 'Prosthodontics Clinical Practicum',
    room: 'BU Dental Clinic — Lab Room 204',
    schedule: '01:00 PM - 05:00 PM (Today)',
    instructor: 'Dr. Fernando Cruz, DMD',
    status: 'no_session',
    statusMessage: 'No active session right now. Scheduled for 01:00 PM today.'
  },
  ORAL301: {
    code: 'ORAL301',
    name: 'Oral Surgery Clinic',
    room: 'BU Dental Clinic — Operating Room B',
    schedule: '07:00 AM - 09:00 AM (Today)',
    instructor: 'Dr. Angela Reyes, DMD',
    status: 'ended',
    statusMessage: 'Session ENDED at 09:00 AM. Check-in window is now closed.'
  }
};

export const Attendance: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students, attendanceRecords, addAttendanceRecord } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentIdKey = currentStudent?.id || '1';
  const studentName = currentStudent?.name || user?.display_name || 'Dental Student';
  const studentIdNum = currentStudent?.studentId || '2023-BU-0142';

  const enrolledSubjects = currentStudent?.enrolledSubjects || [
    { code: 'CLIN401', name: 'Restorative Dentistry Lab', units: 3, isClinical: true, grade: 1.75 },
    { code: 'PROS402', name: 'Prosthodontics Clinical Practicum', units: 4, isClinical: true, grade: 2.0 },
    { code: 'ORAL301', name: 'Oral Surgery Clinic', units: 3, isClinical: true, grade: 2.25 }
  ];

  // STEP 1: DROPDOWN CLASS SELECTION
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('CLIN401');

  // STEP 2: SESSION STATUS CHECK & INFO
  const activeSessionInfo: ClassSessionInfo = MOCK_CLASS_SESSIONS[selectedCourseCode] || {
    code: selectedCourseCode,
    name: enrolledSubjects.find(s => s.code === selectedCourseCode)?.name || 'Clinical Dentistry',
    room: 'BU Dental Clinic',
    schedule: '08:00 AM - 12:00 PM',
    instructor: 'Clinical Faculty',
    status: 'active',
    statusMessage: 'Session open for attendance.'
  };

  // Face Registration Check
  const storageKey = `dentisys_face_registered_${studentIdKey}`;
  const isFaceRegistered = localStorage.getItem(storageKey) === 'true';

  // STEP 3: GEOFENCING LOCATION CHECK & LIVE GPS
  const [gpsLoading, setGpsLoading] = useState(false);
  const [overrideGeofence, setOverrideGeofence] = useState(true);
  const [gpsData, setGpsData] = useState<{
    lat: number;
    lng: number;
    distanceMeters: number;
    inGeofence: boolean;
    locationName: string;
  }>({
    lat: 13.1436,
    lng: 123.7438,
    distanceMeters: 12,
    inGeofence: true,
    locationName: 'BU Dental Clinic (Zone A)'
  });

  const refreshGpsLocation = () => {
    if (overrideGeofence) {
      setGpsData({
        lat: 13.1436,
        lng: 123.7438,
        distanceMeters: 12,
        inGeofence: true,
        locationName: 'BU Dental Clinic (Zone A)'
      });
      return;
    }

    if (!navigator.geolocation) return;
    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const distKm = getDistanceKm(
          pos.coords.latitude,
          pos.coords.longitude,
          BU_DENTAL_CLINIC_COORDS.lat,
          BU_DENTAL_CLINIC_COORDS.lng
        );
        const distM = Math.round(distKm * 1000);
        const isInside = distKm <= BU_DENTAL_CLINIC_COORDS.maxDistanceKm;

        setGpsData({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          distanceMeters: distM,
          inGeofence: isInside,
          locationName: isInside ? 'BU Dental Clinic' : `${distM}m from BU Clinic`
        });
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
      },
      { timeout: 5000 }
    );
  };

  useEffect(() => {
    refreshGpsLocation();
  }, [overrideGeofence]);

  // Webcam stream
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!isFaceRegistered) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(s => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => { });

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isFaceRegistered]);

  // ATTENDANCE SUBMISSION
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationOutcome, setVerificationOutcome] = useState<{
    success: boolean;
    message: string;
    time?: string;
    status?: 'present' | 'late';
  } | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const studentRecords = attendanceRecords.filter(r => r.studentId === currentStudent?.id);
  const todayRecord = studentRecords.find(r => r.date === todayStr && r.subjectCode === selectedCourseCode);

  const handleTakeAttendance = () => {
    if (!isFaceRegistered || activeSessionInfo.status !== 'active') return;

    setIsVerifying(true);
    setVerificationOutcome(null);

    setTimeout(() => {
      setIsVerifying(false);

      if (!gpsData.inGeofence && !overrideGeofence) {
        setVerificationOutcome({
          success: false,
          message: `Step 3 Geofence Failed: Outside clinic area (${gpsData.distanceMeters}m away).`
        });
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isLate = now.getHours() >= 9;
      const statusVal = isLate ? 'late' : 'present';

      addAttendanceRecord({
        studentId: currentStudent?.id || '1',
        date: todayStr,
        subjectCode: selectedCourseCode,
        status: statusVal,
        verificationType: 'facial_geofence',
        faceVerified: true,
        locationVerified: true,
        verifiedLocationName: gpsData.locationName,
        verifiedAt: timeStr,
      });

      setVerificationOutcome({
        success: true,
        message: `Attendance recorded successfully for ${selectedCourseCode}!`,
        time: timeStr,
        status: statusVal
      });
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">

      {/* 1. Clean Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Daily Class Check-In
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Verify session status, check geofence location, and scan face to submit attendance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] font-mono font-bold text-slate-400 block">STUDENT ID</span>
            <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{studentIdNum}</span>
          </div>

          <button
            onClick={() => navigate('/student/attendance-logs')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Attendance Logs</span>
          </button>
        </div>
      </div>

      {/* FACE REGISTRATION WARNING */}
      {!isFaceRegistered && (
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-4 border border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span>Face registration required before taking session attendance.</span>
          </div>
          <button
            onClick={() => navigate('/student/face-registration')}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors flex-shrink-0 cursor-pointer"
          >
            Register Face Now
          </button>
        </div>
      )}

      {/* STEP 1: SELECT CLASS (DROPDOWN SELECTION) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold text-xs flex items-center justify-center">
            1
          </div>
          <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
            Step 1: Select Enrolled Class
          </h2>
        </div>

        <div className="relative max-w-md">
          <select
            value={selectedCourseCode}
            onChange={(e) => {
              setSelectedCourseCode(e.target.value);
              setVerificationOutcome(null);
            }}
            className="w-full pl-4 pr-10 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
          >
            {enrolledSubjects.map(subj => (
              <option key={subj.code} value={subj.code}>
                {subj.code} — {subj.name} ({subj.units} Units)
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* STEP 2: SESSION STATUS CHECK & SESSION INFO */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold text-xs flex items-center justify-center">
              2
            </div>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              Step 2: Session Status Check & Info
            </h2>
          </div>

          {/* Session Status Indicator Badge */}
          <div>
            {activeSessionInfo.status === 'active' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Session
              </span>
            )}
            {activeSessionInfo.status === 'no_session' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                No Active Session
              </span>
            )}
            {activeSessionInfo.status === 'ended' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Session Ended
              </span>
            )}
          </div>
        </div>

        {/* Session Details Card */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase">
                {activeSessionInfo.code}
              </span>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                {activeSessionInfo.name}
              </h3>
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {activeSessionInfo.statusMessage}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs border-t border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Building className="w-4 h-4 text-blue-600" />
              <span>{activeSessionInfo.room}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>{activeSessionInfo.schedule}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <User className="w-4 h-4 text-blue-600" />
              <span>{activeSessionInfo.instructor}</span>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3: GEOFENCING LOCATION CHECK & LIVE GPS */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-extrabold text-xs flex items-center justify-center">
              3
            </div>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              Step 3: Geofencing Location Check & Live GPS
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshGpsLocation}
              disabled={gpsLoading}
              className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh GPS"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
            </button>

            <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideGeofence}
                onChange={(e) => setOverrideGeofence(e.target.checked)}
                className="rounded text-blue-600 border-slate-300"
              />
              <span>Dev GPS Mock</span>
            </label>
          </div>
        </div>

        {/* Live GPS Status Box */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-800 dark:text-slate-200">{gpsData.locationName}</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 block pl-5.5">
                Coordinates: {gpsData.lat.toFixed(4)}° N, {gpsData.lng.toFixed(4)}° E (200m Radius)
              </span>
            </div>

            <span className={`self-start sm:self-center px-3 py-1 rounded-full text-[10px] font-bold ${gpsData.inGeofence
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
              }`}>
              {gpsData.inGeofence ? 'Geofence Validated ✓' : 'Outside Geofence ✕'}
            </span>
          </div>
        </div>
      </div>

      {/* FACIAL RECOGNITION & SUBMISSION SECTION */}
      {isFaceRegistered && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                Facial Scan & Submit Attendance
              </h2>
            </div>

            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
              Session: {selectedCourseCode}
            </span>
          </div>

          {/* Camera Viewfinder */}
          <div className="relative w-full max-w-sm mx-auto aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-40 h-52 rounded-[50%] border-2 ${isVerifying ? 'border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.6)]' : 'border-white/60 border-dashed'
                }`} />
            </div>

            {isVerifying && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2">
                <div className="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold">Verifying Face & Geofence GPS...</p>
              </div>
            )}
          </div>

          {/* Action Button */}
          {todayRecord ? (
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-center text-xs text-blue-700 dark:text-blue-300 font-bold">
              ✓ Attendance already recorded for {selectedCourseCode} today!
            </div>
          ) : activeSessionInfo.status !== 'active' ? (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500 font-bold">
              Check-In Disabled: {activeSessionInfo.statusMessage}
            </div>
          ) : !gpsData.inGeofence && !overrideGeofence ? (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center text-xs text-rose-700 dark:text-rose-300 font-bold">
              Check-In Disabled: Outside clinic geofence area.
            </div>
          ) : (
            <button
              onClick={handleTakeAttendance}
              disabled={isVerifying}
              className={`w-full py-3.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${isVerifying
                  ? 'bg-blue-400 text-white cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99]'
                }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Submit Attendance for {selectedCourseCode}</span>
            </button>
          )}

          {/* Outcome Banner */}
          {verificationOutcome && (
            <div className={`p-4 rounded-2xl border text-xs space-y-1 ${verificationOutcome.success
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-100'
              }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  {verificationOutcome.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span>{verificationOutcome.message}</span>
                </div>
                {verificationOutcome.success && (
                  <button
                    onClick={() => navigate('/student/attendance-logs')}
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    View Logs <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              {verificationOutcome.success && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  Student: <strong>{studentName}</strong> ({studentIdNum}) • Recorded at {verificationOutcome.time} ({verificationOutcome.status?.toUpperCase()}).
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* FOOTER LINK TO DEDICATED LOGS PAGE */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div>
          <h4 className="font-extrabold text-slate-800 dark:text-slate-100">Need to check your past attendance entries?</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">Review your full historical log of facial recognition and geofenced session check-ins.</p>
        </div>

        <button
          onClick={() => navigate('/student/attendance-logs')}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
        >
          <History className="w-4 h-4 text-blue-600" />
          <span>Open Attendance Logs Page</span>
        </button>
      </div>

    </div>
  );
};
