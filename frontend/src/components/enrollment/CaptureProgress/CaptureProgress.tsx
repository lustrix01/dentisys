// src/components/enrollment/CaptureProgress/CaptureProgress.tsx
import React from 'react';

interface Props {
  captured: number;
  total: number;
}

export const CaptureProgress: React.FC<Props> = ({ captured, total }) => {
  const percent = Math.round((captured / total) * 100);
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex justify-between mb-1 text-sm">
        <span>Captured {captured}/{total}</span>
        <span>{percent}%</span>
      </div>
      <div className="relative pt-1">
        <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200 dark:bg-gray-700">
          <div
            style={{ width: `${percent}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-emerald-500 transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );
};
