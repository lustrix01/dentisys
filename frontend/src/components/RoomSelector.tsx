import React, { useState, useEffect } from 'react';
import { ROOM_CATEGORIES, ROOM_OPTIONS } from '../utils/scheduleHelper';

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
  const isKnownRoom = ROOM_OPTIONS.includes(value);
  const [isCustom, setIsCustom] = useState(!isKnownRoom && value.trim() !== '');

  useEffect(() => {
    if (!isKnownRoom && value.trim() !== '') {
      setIsCustom(true);
    } else if (isKnownRoom) {
      setIsCustom(false);
    }
  }, [value, isKnownRoom]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustom(true);
      if (isKnownRoom) {
        onChange('');
      }
    } else {
      setIsCustom(false);
      onChange(val);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="font-semibold text-slate-600 dark:text-slate-400 block text-[11px]">
          {label}
        </label>
      )}
      <select
        id={id}
        value={isCustom ? 'CUSTOM' : (isKnownRoom ? value : (value ? 'CUSTOM' : ''))}
        onChange={handleSelectChange}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs cursor-pointer focus:ring-2 focus:ring-accent-500 focus:outline-none"
      >
        <option value="" disabled>-- {placeholder} --</option>
        {ROOM_CATEGORIES.map(cat => (
          <optgroup key={cat.category} label={cat.category}>
            {cat.rooms.map(room => (
              <option key={room} value={room}>{room}</option>
            ))}
          </optgroup>
        ))}
        <option value="CUSTOM">✏️ Other / Custom Room...</option>
      </select>

      {(isCustom || (!isKnownRoom && value.trim() !== '')) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type custom room name (e.g. Room 405)"
          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs focus:ring-2 focus:ring-accent-500 focus:outline-none animate-fade-in"
        />
      )}
    </div>
  );
};
