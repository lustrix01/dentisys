import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Monitor, Play, Square, Video, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { getAssignedClassName, getCurrentSecretary } from './utils';

import { getCctvStatus, CctvFeedData } from '../../services/secretaryService';

export const CCTVFeed: React.FC = () => {
  const secretary = getCurrentSecretary();
  const className = getAssignedClassName(secretary);
  const classroomName = secretary?.classroomName || 'Dental Clinic B - Room 402';
  const cameraId = secretary?.cctvCameraId || 'CCTV-CLINIC-A-01';
  const [isRunning, setIsRunning] = useState(false);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);
  const [error, setError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clock, setClock] = useState('');
  const [cctvData, setCctvData] = useState<CctvFeedData['cctv'] | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    getCctvStatus()
      .then(res => {
        if (res.success) {
          setCctvData(res.cctv);
        }
      })
      .catch(err => {
        console.warn('CCTV status check note:', err);
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(new Date().toLocaleString());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  const startFeed = async () => {
    setIsRunning(true);
    setError('');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable in this browser context.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      setStream(mediaStream);
      setIsCameraAvailable(true);
    } catch (err) {
      setIsCameraAvailable(false);
      setStream(null);
      setError(err instanceof Error ? err.message : 'The classroom camera is offline or unavailable.');
    }
  };

  const stopFeed = () => {
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsCameraAvailable(false);
    setIsRunning(false);
    setError('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-clinical-600 dark:text-clinical-400 uppercase tracking-widest">Assigned Classroom CCTV</p>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-slate-100">{classroomName}</h1>
          <p className="text-xs text-slate-400">{className} - {cameraId}</p>
        </div>
        {isRunning ? (
          <button
            onClick={stopFeed}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop Feed
          </button>
        ) : (
          <button
            onClick={startFeed}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-clinical-600 hover:bg-clinical-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Feed
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-clinical-500" />
              Live Stream
            </CardTitle>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
              isRunning && isCameraAvailable
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
            }`}>
              {isRunning && isCameraAvailable ? 'Online' : 'Offline'}
            </span>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-video rounded-2xl bg-slate-950 overflow-hidden border border-slate-900 shadow-inner flex items-center justify-center">
              {isRunning && isCameraAvailable && (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}

              {isRunning && !isCameraAvailable && (
                <div className="text-center p-8 max-w-md">
                  <WifiOff className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                  <h3 className="text-sm font-bold text-slate-100">Camera offline or unavailable</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    {error || 'The classroom camera cannot be reached. Check browser permissions or the assigned CCTV connection.'}
                  </p>
                </div>
              )}

              {!isRunning && (
                <div className="text-center p-8">
                  <Monitor className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Feed Stopped</h3>
                  <p className="text-xs text-slate-500 mt-2">Start the assigned classroom camera feed when monitoring is required.</p>
                </div>
              )}

              {isRunning && isCameraAvailable && (
                <div className="absolute top-4 left-4 right-4 flex justify-between text-[10px] font-mono font-bold text-emerald-400 bg-slate-950/70 rounded-lg border border-slate-800 px-3 py-2">
                  <span>REC - {cameraId}</span>
                  <span>{clock}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Access Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Secretary</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{secretary?.name || 'Class Secretary'}</p>
              <p className="text-xs text-slate-400">{secretary?.email}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/40">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{className}</p>
              <p className="text-xs text-slate-400">{classroomName}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-clinical-500/10 border border-clinical-500/20 p-4 text-xs text-clinical-800 dark:text-clinical-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>This page exposes only the CCTV camera assigned to the secretary's class.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
