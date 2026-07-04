import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Video, ShieldCheck, ShieldAlert, Wifi, Play, Square, Eye, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { useApp } from '../../context/AppContext';

interface ScanLog {
  id: string;
  name: string;
  studentId: string;
  time: string;
  confidence: number;
  status: 'present' | 'late';
  subjectCode: string;
}

export const CCTVMonitoring: React.FC = () => {
  const { students } = useApp();
  
  // Secretary is also a student
  const allStudents = useMemo(() => [
    { id: 'sec-01', studentId: 'DENT-2023-0999', name: 'Miss Clara Oswald', email: 'secretary@bicol-u.edu.ph', yearLevel: 3 },
    ...students
  ], [students]);

  const [isRunning, setIsRunning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [activeDetection, setActiveDetection] = useState<{ name: string; confidence: number } | null>(null);
  const [cctvTime, setCctvTime] = useState('');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Safely assign stream once video DOM element mounts
  useEffect(() => {
    if (cameraActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [cameraActive, stream]);

  // Dynamic CCTV clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCctvTime(now.toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const startCCTV = async () => {
    setIsRunning(true);
    setScanLogs([]);
    setActiveDetection(null);

    // Try starting camera
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Biometric webcam API not supported or disabled in this browser context.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 300, facingMode: 'user' }
      });
      setStream(mediaStream);
      setCameraActive(true);
    } catch (err) {
      console.error('CCTV Camera Access Error:', err);
      setCameraActive(false); // Fallback to simulated stream
    }
  };

  const stopCCTV = () => {
    setIsRunning(false);
    setActiveDetection(null);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  // Live scanner match generation loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        // Pick a random student
        const randIdx = Math.floor(Math.random() * allStudents.length);
        const student = allStudents[randIdx];
        const confidence = parseFloat((92 + Math.random() * 7.5).toFixed(1));
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];

        // Trigger flash alert box on camera
        setActiveDetection({ name: student.name, confidence });

        // Add log entry
        const isLate = now.getHours() >= 9 || (now.getHours() === 8 && now.getMinutes() > 30);
        const newLog: ScanLog = {
          id: Math.random().toString(),
          name: student.name,
          studentId: student.studentId,
          time: timeStr,
          confidence,
          status: isLate ? 'late' : 'present',
          subjectCode: ['CLIN401', 'CLIN402', 'ODON401'][Math.floor(Math.random() * 3)],
        };

        setScanLogs(prev => [newLog, ...prev.slice(0, 7)]);

        // Reset box highlight after 2.5 seconds
        setTimeout(() => {
          setActiveDetection(null);
        }, 2500);

      }, 5000); // scan every 5 seconds
    }
    return () => clearInterval(interval);
  }, [isRunning, allStudents]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Live CCTV Face Scan Terminal</h1>
          <p className="text-xs text-slate-400">clinic access point surveillance with real-time biometric identification and logs automation.</p>
        </div>
        <div className="flex gap-2">
          {isRunning ? (
            <button
              onClick={stopCCTV}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Scanner Feed
            </button>
          ) : (
            <button
              onClick={startCCTV}
              className="flex items-center gap-1.5 px-4 py-2 bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Start Scanner Feed
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: CCTV Video Display HUD (Col 7) */}
        <div className="lg:col-span-7">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-500" />
                SURVEILLANCE: CLINIC_ENTRANCE_01
              </CardTitle>
              <div className="flex items-center space-x-1.5 text-xs text-emerald-500 font-semibold uppercase">
                <Wifi className="w-4 h-4 animate-pulse" />
                <span>ONLINE</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              
              {/* CCTV Feed Wrapper */}
              <div className="relative aspect-video w-full rounded-2xl bg-slate-950 border border-slate-900 overflow-hidden flex items-center justify-center shadow-inner group">
                
                {/* 1. Camera active */}
                {isRunning && cameraActive && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}

                {/* 2. Mock CCTV loop */}
                {isRunning && !cameraActive && (
                  <div className="text-center p-6 space-y-4">
                    <div className="w-20 h-20 rounded-full border-4 border-dashed border-indigo-400/40 border-t-indigo-500 animate-spin mx-auto flex items-center justify-center">
                      <Video className="w-8 h-8 text-indigo-500 animate-pulse" />
                    </div>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider animate-pulse">Running live scan feed simulation...</p>
                  </div>
                )}

                {/* 3. Inactive Feed */}
                {!isRunning && (
                  <div className="text-center p-8 space-y-3.5">
                    <div className="w-14 h-14 bg-slate-900 flex items-center justify-center mx-auto text-slate-700 border border-slate-800 rounded-2xl">
                      <Video className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scanner Off</h3>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[220px] mx-auto leading-relaxed">Start the terminal scanner feed to activate CCTV facial recognition.</p>
                    </div>
                  </div>
                )}

                {/* CCTV Graphics Overlays */}
                {isRunning && (
                  <>
                    <div className="absolute top-4 left-4 right-4 flex justify-between select-none pointer-events-none text-[10px] font-mono text-emerald-500 font-bold bg-slate-950/70 p-2.5 rounded-lg border border-slate-900/50 backdrop-blur-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span>• REC LIVE</span>
                      </div>
                      <span>{cctvTime}</span>
                    </div>

                    <div className="absolute inset-0 border border-emerald-500/10 pointer-events-none" />
                    {/* CCTV scanning crosshairs */}
                    <div className="absolute inset-0 border-[0.5px] border-slate-200/5 pointer-events-none grid grid-cols-3 grid-rows-3">
                      <div className="border-r border-b border-white/5" />
                      <div className="border-r border-b border-white/5" />
                      <div className="border-b border-white/5" />
                      <div className="border-r border-b border-white/5" />
                      <div className="border-r border-b border-white/5" />
                      <div className="border-b border-white/5" />
                    </div>

                    {/* Active Match detection overlay */}
                    {activeDetection && (
                      <div className="absolute inset-0 m-auto w-48 h-48 border-2 border-emerald-500 rounded-full flex flex-col justify-between items-center p-3 animate-pulse bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] z-20">
                        <span className="text-[8px] font-bold tracking-widest text-emerald-400 uppercase bg-slate-950 px-1.5 py-0.5 rounded">LOCK-ON</span>
                        <div className="text-center bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 backdrop-blur-xs select-none">
                          <span className="text-[9px] font-bold text-slate-100 block truncate max-w-[120px]">{activeDetection.name}</span>
                          <span className="text-[9px] font-mono font-bold text-emerald-400 mt-0.5 block">{activeDetection.confidence}% MATCH</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Live Biometric Log Activity (Col 5) */}
        <div className="lg:col-span-5">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader>
              <CardTitle>Biometric Scanner Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              
              {scanLogs.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-6 text-slate-450 text-xs">
                  <Eye className="w-10 h-10 text-slate-650 mb-3 animate-pulse" />
                  {isRunning ? (
                    <p className="font-semibold text-slate-500">Awaiting Access Scans... Logs will populate automatically.</p>
                  ) : (
                    <p className="font-semibold text-slate-500">Live logs will stream here once surveillance scan begins.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[340px] pr-1.5 scrollbar-thin">
                  {scanLogs.map(log => (
                    <div 
                      key={log.id} 
                      className="p-3 bg-slate-50/50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40 rounded-xl flex items-center justify-between gap-3 animate-slide-in text-[11px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Circle initial */}
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-clinical-500/10 to-accent-500/10 text-accent-700 dark:text-accent-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {log.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '')[0]}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-250 truncate block">{log.name}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{log.studentId} • {log.subjectCode}</span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="font-mono text-slate-400 text-[10px] block">{log.time}</span>
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 block uppercase tracking-wider">{log.confidence}% Match</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Status footer inside logs */}
              {isRunning && scanLogs.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3.5 mt-4 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Auto-log active
                  </span>
                  <span>Logs: {scanLogs.length} Scans</span>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};
