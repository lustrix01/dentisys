import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Camera, 
  ShieldCheck, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Lock, 
  ArrowRight,
  Sparkles,
  AlertCircle,
  UserCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/Card';

export const FaceRegistration: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { students } = useApp();

  const currentStudent = students.find(
    s => s.email.toLowerCase() === user?.login_email.toLowerCase() || s.id === '1'
  ) || students[0];

  const studentIdKey = currentStudent?.id || '1';
  const studentName = currentStudent?.name || user?.display_name || 'Dental Student';
  const studentIdNum = currentStudent?.studentId || '2023-BU-0142';

  const storageKey = `dentisys_face_registered_${studentIdKey}`;
  const timestampKey = `dentisys_face_registered_at_${studentIdKey}`;

  const [isRegistered, setIsRegistered] = useState<boolean>(() => {
    return localStorage.getItem(storageKey) === 'true';
  });
  const [registeredAt, setRegisteredAt] = useState<string>(() => {
    return localStorage.getItem(timestampKey) || '';
  });

  // Steps: 1 = Agreement, 2 = Camera Capture, 3 = Success
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(() => {
    return localStorage.getItem(storageKey) === 'true' ? 3 : 1;
  });

  // Step 1: Consent Checkbox
  const [hasAgreed, setHasAgreed] = useState(false);

  // Step 2: Camera Capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Start webcam when entering Step 2
  useEffect(() => {
    if (currentStep !== 2) return;

    let mediaStream: MediaStream | null = null;
    setCameraError(null);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(stream => {
        mediaStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Camera access error:', err);
        setCameraError('Unable to access webcam. Please check browser permissions and try again.');
      });

    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentStep]);

  const handleProceedToScan = () => {
    if (!hasAgreed) return;
    setCurrentStep(2);
  };

  const handleStartCapture = () => {
    setIsScanning(true);
    setScanProgress(0);

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          
          // Complete registration
          const nowStr = new Date().toLocaleString();
          localStorage.setItem(storageKey, 'true');
          localStorage.setItem(timestampKey, nowStr);
          
          setIsRegistered(true);
          setRegisteredAt(nowStr);
          setCurrentStep(3);
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  const handleReRegister = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(timestampKey);
    setIsRegistered(false);
    setRegisteredAt('');
    setHasAgreed(false);
    setScanProgress(0);
    setCurrentStep(1);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider mb-2">
            <UserCheck className="w-3.5 h-3.5" />
            Biometric Enrollment Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-800 dark:text-slate-100">
            Facial Recognition Template Registration
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Register your facial biometric model for automated, location-verified attendance check-in.
          </p>
        </div>

        {isRegistered && currentStep === 3 && (
          <button
            onClick={handleReRegister}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Re-Register Face Template</span>
          </button>
        )}
      </div>

      {/* 3-Step Visual Progress Bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-3 rounded-2xl border text-center transition-all ${
          currentStep === 1 
            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' 
            : currentStep > 1 
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
              : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 1</span>
          <span className="text-xs font-extrabold block mt-0.5">Privacy Agreement</span>
        </div>

        <div className={`p-3 rounded-2xl border text-center transition-all ${
          currentStep === 2 
            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' 
            : currentStep > 2 
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
              : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 2</span>
          <span className="text-xs font-extrabold block mt-0.5">Facial Scan</span>
        </div>

        <div className={`p-3 rounded-2xl border text-center transition-all ${
          currentStep === 3 
            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' 
            : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-wider block">Step 3</span>
          <span className="text-xs font-extrabold block mt-0.5">Registration Status</span>
        </div>
      </div>

      {/* STEP 1: PRIVACY & DATA CONSENT AGREEMENT */}
      {currentStep === 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                Step 1 of 3
              </span>
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                Data Privacy & Facial Biometrics Agreement
              </h2>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-800 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>
              In compliance with the <strong className="text-slate-800 dark:text-slate-100">Data Privacy Act of 2012 (Republic Act No. 10173)</strong> and Bicol University regulations, please read the biometric data collection terms below:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Purpose:</strong> Your facial template vector will be recorded solely for automated identity verification during daily clinical session attendance check-in.
              </li>
              <li>
                <strong>Security:</strong> Biometric representations are converted into mathematical feature vectors and stored securely. Original video frames are not permanently published or retained.
              </li>
              <li>
                <strong>Student Rights:</strong> You may update or re-register your facial biometric template at any time through this portal.
              </li>
            </ul>
          </div>

          {/* Mandatory Agreement Checkbox */}
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex items-start gap-3">
            <input
              type="checkbox"
              id="privacy-consent-checkbox"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <label htmlFor="privacy-consent-checkbox" className="text-xs text-slate-700 dark:text-slate-200 font-medium cursor-pointer leading-snug">
              I have read, understood, and agree to the <strong className="text-blue-700 dark:text-blue-300">Facial Recognition and Data Privacy Agreement</strong>. I consent to registering my facial biometric template for attendance tracking.
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleProceedToScan}
              disabled={!hasAgreed}
              className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 ${
                hasAgreed 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer' 
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>Continue to Facial Scan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: FACIAL SCAN CAMERA CAPTURE */}
      {currentStep === 2 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                  Step 2 of 3
                </span>
                <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                  Align Face in Camera Frame
                </h2>
              </div>
            </div>

            <button
              onClick={() => setCurrentStep(1)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Back to Terms
            </button>
          </div>

          {cameraError ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Camera Access Required</strong>
                <p className="mt-0.5 leading-relaxed">{cameraError}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full max-w-md mx-auto aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />

                {/* Face Alignment Target Oval Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-52 h-64 rounded-[50%] border-2 transition-all ${
                    isScanning ? 'border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.5)]' : 'border-white/60 border-dashed'
                  }`} />
                </div>

                {/* Scan Overlay Banner */}
                {isScanning && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-4 text-center text-white space-y-1.5">
                    <p className="text-xs font-bold animate-pulse">Extracting Facial Feature Vector... {scanProgress}%</p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ensure good lighting, look directly into the camera, and keep your face inside the target frame.
                </p>

                <button
                  onClick={handleStartCapture}
                  disabled={isScanning}
                  className={`px-8 py-3 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 mx-auto ${
                    isScanning
                      ? 'bg-blue-400 text-white cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isScanning ? 'Scanning...' : 'Capture & Extract Face Template'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: SUCCESSFUL REGISTRATION NOTIFICATION & TEMPLATE AUDIT */}
      {currentStep === 3 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">
                Biometric Registration Active
              </span>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                Facial Biometric Template Active & Verified
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student Name</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">{studentName}</span>
              <span className="text-xs text-slate-500 font-mono">ID: {studentIdNum}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registration Date & Time</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">
                {registeredAt || 'Active Session'}
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Status: Active ✓</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-0.5 text-center sm:text-left">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Ready for Class Session Attendance Check-In
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You can now take attendance for active clinical sessions using facial recognition & geofencing.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleReRegister}
                className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer flex-shrink-0"
              >
                Re-Register Face
              </button>

              <button
                onClick={() => navigate('/student/attendance')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
              >
                <span>Go to Daily Attendance</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
