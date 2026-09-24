import React from 'react';
import { CheckCircle2, Loader2, Sparkles, ArrowLeft, ArrowRight, Eye, User } from 'lucide-react';

interface BiometricRadialScannerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  totalTicks: number; // 28 for enrollment, 16 for attendance
  capturedCount: number;
  currentStep: 1 | 2 | 3 | 4; // 1: center, 2: action 1, 3: action 2, 4: complete
  currentActionType: 'center' | 'turn_left' | 'turn_right' | 'blink' | 'complete';
  instruction: string;
  isFaceDetected: boolean;
  stepVerified: boolean;
}

export const BiometricRadialScanner: React.FC<BiometricRadialScannerProps> = ({
  videoRef,
  totalTicks,
  capturedCount,
  currentStep,
  currentActionType,
  instruction,
  isFaceDetected,
  stepVerified,
}) => {
  // SVG coordinates: 320x320 viewBox, center at (160, 160)
  const size = 320;
  const center = size / 2;
  const outerRadius = 148;
  const innerRadius = 134;

  const ticks = Array.from({ length: totalTicks }, (_, index) => {
    const angleDeg = (index / totalTicks) * 360 - 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x1 = center + innerRadius * Math.cos(angleRad);
    const y1 = center + innerRadius * Math.sin(angleRad);
    const x2 = center + outerRadius * Math.cos(angleRad);
    const y2 = center + outerRadius * Math.sin(angleRad);
    const isFilled = index < capturedCount;

    return {
      index,
      x1,
      y1,
      x2,
      y2,
      isFilled,
    };
  });

  const progressPercent = Math.min(100, Math.round((capturedCount / totalTicks) * 100));
  const isComplete = currentStep === 4 || capturedCount >= totalTicks;

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-2">
      {/* Radial Scanner Container */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
        {/* SVG Radial Ticks (Apple Face ID Style) */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 w-full h-full pointer-events-none z-10 transition-transform duration-300"
        >
          {ticks.map((tick) => (
            <line
              key={tick.index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={
                tick.isFilled
                  ? '#10b981'
                  : 'rgba(148, 163, 184, 0.28)'
              }
              strokeWidth={tick.isFilled ? 3.5 : 2.5}
              strokeLinecap="round"
              className="transition-colors duration-200"
              style={{
                filter: tick.isFilled ? 'drop-shadow(0 0 3px rgba(16, 185, 129, 0.7))' : undefined,
              }}
            />
          ))}

          {/* Outer glowing ring when complete */}
          {isComplete && (
            <circle
              cx={center}
              cy={center}
              r={outerRadius + 4}
              fill="none"
              stroke="#10b981"
              strokeWidth={3}
              className="animate-pulse"
              style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.8))' }}
            />
          )}
        </svg>

        {/* Circular Camera Viewport */}
        <div
          className={`w-60 h-60 sm:w-64 sm:h-64 rounded-full overflow-hidden bg-slate-950 relative shadow-2xl transition-all duration-300 border-2 ${
            isComplete
              ? 'border-emerald-500 ring-4 ring-emerald-500/25'
              : stepVerified
                ? 'border-emerald-400 ring-2 ring-emerald-400/20'
                : !isFaceDetected
                  ? 'border-rose-500/70 ring-2 ring-rose-500/10'
                  : 'border-blue-500/60'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Soft Circular Vignette Overlay */}
          <div className="absolute inset-0 rounded-full pointer-events-none bg-radial from-transparent via-transparent to-black/40" />

          {/* Dynamic Action Icon Overlay Inside Circle */}
          {currentActionType === 'turn_left' && !isComplete && (
            <div className="absolute top-4 left-4 bg-emerald-500/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black shadow-lg animate-bounce backdrop-blur-md">
              <ArrowLeft className="w-4 h-4" />
              <span>Turn Left</span>
            </div>
          )}

          {currentActionType === 'turn_right' && !isComplete && (
            <div className="absolute top-4 right-4 bg-emerald-500/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black shadow-lg animate-bounce backdrop-blur-md">
              <span>Turn Right</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          )}

          {currentActionType === 'blink' && !isComplete && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-500/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black shadow-lg animate-pulse backdrop-blur-md">
              <Eye className="w-4 h-4" />
              <span>Blink Eyes</span>
            </div>
          )}

          {currentActionType === 'center' && !isComplete && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-black shadow-lg backdrop-blur-md">
              <User className="w-3.5 h-3.5" />
              <span>Look Straight</span>
            </div>
          )}

          {/* Complete Checkmark In Center */}
          {isComplete && (
            <div className="absolute inset-0 bg-emerald-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-white animate-fade-in space-y-1">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xl animate-scale-in">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <span className="text-sm font-extrabold text-emerald-200 mt-2">Scan Complete!</span>
              <span className="text-[11px] text-emerald-300 font-mono">{capturedCount} / {totalTicks} samples</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating HUD Instruction Pill Below Circle */}
      <div className="mt-4 max-w-sm w-full px-4 text-center space-y-2">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-md ${
            isComplete
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : stepVerified
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : !isFaceDetected
                  ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
          }`}
        >
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : stepVerified ? (
            <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0 animate-spin" />
          ) : !isFaceDetected ? (
            <Loader2 className="w-3.5 h-3.5 text-rose-500 animate-spin flex-shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
          )}
          <span>{instruction}</span>
        </div>

        {/* Progress Counter Tag */}
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          <span className="font-mono text-emerald-600 dark:text-emerald-400">{progressPercent}%</span>
          <span>•</span>
          <span className="font-mono">{capturedCount} / {totalTicks} biometric frames</span>
        </div>
      </div>
    </div>
  );
};
