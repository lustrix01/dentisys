import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, RefreshCw, CheckCircle, ShieldAlert, Award, UserCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/Card';
import { useApp } from '../../context/AppContext';

export const FacialEnrollment: React.FC = () => {
  const { students } = useApp();
  
  // Secretary is also a student (representing herself in enrollment lists)
  const allEnrollableStudents = useMemo(() => [
    { id: 'sec-01', studentId: 'DENT-2023-0999', name: 'Miss Clara Oswald (Secretary)', email: 'secretary@bicol-u.edu.ph', yearLevel: 3 },
    ...students
  ], [students]);

  const [selectedStudentId, setSelectedStudentId] = useState(allEnrollableStudents[0]?.studentId || '');
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'captured' | 'enrolled'>('idle');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedStudent = allEnrollableStudents.find(s => s.studentId === selectedStudentId);

  // Safely assign stream once video DOM element mounts
  useEffect(() => {
    if (cameraActive && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [cameraActive, stream]);

  const startCamera = async () => {
    setCameraError(false);
    setCapturedImage(null);
    setScanStatus('idle');
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
      console.error('Webcam access error:', err);
      setCameraError(true);
      setCameraActive(true); // Fallback to mock scanner
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const captureFrame = () => {
    if (cameraError) {
      // Mock Capture
      setScanStatus('scanning');
      setProgress(0);
      return;
    }

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        // Mirror the capture
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
        setScanStatus('captured');
      }
    }
  };

  // Mock Scanner Progress Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scanStatus === 'scanning') {
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            // Complete scan, capture mock frame
            setCapturedImage('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300&h=300');
            setScanStatus('captured');
            return 100;
          }
          return prev + 10;
        });
      }, 150);
    }
    return () => clearInterval(interval);
  }, [scanStatus]);

  const handleEnroll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!capturedImage) return;

    setScanStatus('enrolled');
    setTimeout(() => {
      alert(`Facial vector enrolled successfully for ${selectedStudent?.name}! System ID: ${selectedStudent?.studentId} is now locked.`);
      setScanStatus('idle');
      setCapturedImage(null);
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <style>{`
        @keyframes scan {
          0%, 100% { top: 5%; }
          50% { top: 95%; }
        }
        .laser-line {
          animation: scan 2s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-extrabold font-heading text-slate-800 dark:text-slate-100">Student Facial Enrollment</h1>
        <p className="text-xs text-slate-400">Scan and register high-precision biometric face vectors to automate security logs and logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Camera Scanner (Col 7) */}
        <div className="lg:col-span-7">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle>Biometric Scanner Terminal</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              
              {/* Scanner Screen */}
              <div className="relative aspect-video w-full rounded-2xl bg-slate-950 border border-slate-850 overflow-hidden flex items-center justify-center shadow-inner group">
                
                {/* 1. Camera active, no photo captured */}
                {cameraActive && !capturedImage && (
                  <>
                    {!cameraError ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                    ) : (
                      // Mock Scanning Feed if camera error
                      <div className="text-center p-6 space-y-4">
                        <div className="w-20 h-20 rounded-full border-4 border-dashed border-accent-400/40 border-t-accent-500 animate-spin mx-auto flex items-center justify-center">
                          <Camera className="w-8 h-8 text-accent-500 animate-pulse" />
                        </div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Simulating Live Biometric Feed...</p>
                      </div>
                    )}

                    {/* Scanner Overlays */}
                    <div className="absolute inset-0 border border-white/10 pointer-events-none z-10" />
                    {/* Bounding box guide */}
                    <div className="absolute inset-0 border-[2px] border-dashed border-accent-500/40 rounded-full w-48 h-48 sm:w-56 sm:h-56 m-auto pointer-events-none flex items-center justify-center animate-pulse z-10">
                      <div className="w-4 h-4 border-t-2 border-l-2 border-accent-400 absolute top-0 left-0" />
                      <div className="w-4 h-4 border-t-2 border-r-2 border-accent-400 absolute top-0 right-0" />
                      <div className="w-4 h-4 border-b-2 border-l-2 border-accent-400 absolute bottom-0 left-0" />
                      <div className="w-4 h-4 border-b-2 border-r-2 border-accent-400 absolute bottom-0 right-0" />
                    </div>

                    {/* Scanning Laser Line */}
                    <div className="laser-line absolute left-0 w-full h-0.5 bg-accent-500 shadow-[0_0_8px_#9B72CF] z-20" />

                    {/* HUD Stats */}
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between text-[9px] font-mono text-accent-400/80 z-20 select-none bg-slate-900/60 p-2 rounded-lg backdrop-blur-xs">
                      <span>FEED: 1080P @ 60FPS</span>
                      <span>BIOMETRIC: READY</span>
                    </div>
                  </>
                )}

                {/* 2. Scanning Progress State */}
                {scanStatus === 'scanning' && (
                  <div className="text-center p-6 space-y-4">
                    <div className="w-16 h-16 rounded-full border-4 border-accent-500/20 border-t-accent-500 animate-spin mx-auto flex items-center justify-center text-accent-500 font-bold text-xs font-heading">
                      {progress}%
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analyzing Facial Vectors...</p>
                  </div>
                )}

                {/* 3. Photo Captured */}
                {capturedImage && scanStatus !== 'scanning' && (
                  <div className="w-full h-full relative">
                    <img 
                      src={capturedImage} 
                      alt="Captured Face" 
                      className="w-full h-full object-cover scale-x-[-1]" 
                    />
                    <div className="absolute inset-0 bg-accent-950/10 backdrop-blur-[1px] pointer-events-none" />
                    <div className="absolute top-4 right-4 bg-emerald-500 text-white px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Captured Face Match
                    </div>
                  </div>
                )}

                {/* 4. Idle State (No Camera active, No Photo) */}
                {!cameraActive && !capturedImage && scanStatus === 'idle' && (
                  <div className="text-center p-8 space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center mx-auto text-slate-650 border border-slate-800">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">Terminal Inactive</h3>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[240px] mx-auto leading-relaxed">Start the terminal scanner to activate the facial recognition camera capture.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden Canvas */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Controller Buttons */}
              <div className="mt-5 flex gap-3 justify-center">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-5 py-2.5 bg-accent-600 hover:bg-accent-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Start Terminal Camera
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={captureFrame}
                      disabled={scanStatus === 'scanning'}
                      className="px-5 py-2.5 bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      Capture Face Scan
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-650 dark:text-slate-350 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>

            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Student Selection & Info (Col 5) */}
        <div className="lg:col-span-5">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader>
              <CardTitle>Enrollment Profile Directory</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEnroll} className="space-y-5">
                {/* 1. Student Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Student Registry</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => {
                      setSelectedStudentId(e.target.value);
                      setCapturedImage(null);
                      setScanStatus('idle');
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-accent-500 dark:text-slate-100"
                  >
                    {allEnrollableStudents.map(s => (
                      <option key={s.studentId} value={s.studentId} className="dark:bg-slate-900">
                        {s.name} ({s.studentId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Selected Student Metadata Card */}
                {selectedStudent && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 space-y-3.5">
                    <div className="flex items-center space-x-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-clinical-500/10 to-accent-500/10 text-accent-700 dark:text-accent-400 flex items-center justify-center font-bold text-sm">
                        {selectedStudent.name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Miss)\s+/i, '')[0]}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-250">{selectedStudent.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block mt-0.5">{selectedStudent.studentId}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-150/40 dark:border-slate-800/45 pt-3.5 space-y-2 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Year Level:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">Year {selectedStudent.yearLevel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">University Mail:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{selectedStudent.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Biometric State:</span>
                        {scanStatus === 'enrolled' ? (
                          <span className="text-emerald-600 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <UserCheck className="w-3 h-3" /> Enrolled
                          </span>
                        ) : (
                          <span className="text-amber-500 font-bold uppercase tracking-wider text-[9px]">Pending Scan</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Action Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={!capturedImage || scanStatus === 'enrolled' || scanStatus === 'scanning'}
                    className="w-full py-3 bg-accent-600 hover:bg-accent-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-accent-650/10 transition-all cursor-pointer disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-1.5"
                  >
                    <Award className="w-4 h-4" />
                    Submit & Enroll Biometric Profile
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};
