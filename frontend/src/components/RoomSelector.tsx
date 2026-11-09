import React from 'react';
import { ROOM_OPTIONS } from '../utils/scheduleHelper';

interface RoomSelectorProps {
  label?: string;
  value: string;
  onChange: (room: string) => void;
  preferredType?: 'Lecture' | 'Laboratory';
  placeholder?: string;
  id?: string;
}

export const RoomSelector: React.FC<RoomSelectorProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Select Room Venue',
  id,
}) => {
  const isAllowedRoom = (ROOM_OPTIONS as readonly string[]).includes(value);

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="font-semibold text-slate-600 dark:text-slate-400 block text-[11px]">
          {label}
        </label>
      )}
      <select
        id={id}
        value={isAllowedRoom ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs cursor-pointer focus:ring-2 focus:ring-accent-500 focus:outline-none"
      >
        <option value="">-- {placeholder} --</option>
        <option value="DM1">DM1</option>
        <option value="DM2">DM2</option>
        <option value="TBA">TBA (To be announced)</option>
      </select>
      {!isAllowedRoom && value.trim() !== '' && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Saved room: {value}. It will stay unchanged unless you choose DM1, DM2, or TBA.
        </p>
      )}
    </div>
  );
};
