import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getRoomsApi, type RoomOption } from '../services/apiClient';

const norm = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

let inflight: Promise<RoomOption[]> | null = null;
/** ROOM-001: the Dean's room list. Selectors mounting together share one request. */
export function useRooms(): RoomOption[] {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  useEffect(() => {
    let ignore = false;
    inflight ??= getRoomsApi().then(r => r.rooms ?? []).catch(() => []).finally(() => { inflight = null; });
    void inflight.then(list => { if (!ignore) setRooms(list); });
    return () => { ignore = true; };
  }, []);
  return rooms;
}

export const isRetiredRoom = (rooms: RoomOption[], name: string | null | undefined) =>
  !!name && rooms.some(room => room.status === 'retired' && norm(room.name) === norm(name));

/** Yellow warning, never blocks saving. Shows nothing unless a given room is retired. */
export const RetiredRoomWarning: React.FC<{ rooms: RoomOption[]; names: Array<string | null | undefined> }> = ({ rooms, names }) => {
  const retired = [...new Set(names.filter((n): n is string => isRetiredRoom(rooms, n)).map(n => n.trim()))];
  if (retired.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="retired-room-warning">
      {retired.map(name => (
        <p key={name} role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{/^room\b/i.test(name) ? name : `Room ${name}`} was retired by the Dean. Pick a new room.</span>
        </p>
      ))}
    </div>
  );
};

interface RoomSelectorProps {
  label?: string;
  value: string;
  onChange: (room: string) => void;
  preferredType?: 'Lecture' | 'Laboratory';
  placeholder?: string;
  id?: string;
  fieldClassName?: string;
  /** Runs only when the user picks a listed room (not on load), with its saved location if any. */
  onPickRoom?: (room: RoomOption) => void;
}

export const RoomSelector: React.FC<RoomSelectorProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Select Room Venue',
  id,
  fieldClassName,
  onPickRoom,
}) => {
  const rooms = useRooms();
  const match = rooms.find(room => norm(room.name) === norm(value));
  const isKnownRoom = !!match;
  const groups = useMemo(() => {
    const map = new Map<string, RoomOption[]>();
    rooms.filter(room => room.status === 'active').forEach(room => map.set(room.group, [...(map.get(room.group) ?? []), room]));
    return [...map.entries()];
  }, [rooms]);
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
      const picked = rooms.find(room => room.status === 'active' && room.name === val);
      if (picked) onPickRoom?.(picked);
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
        value={isCustom ? 'CUSTOM' : (match ? match.name : (value ? 'CUSTOM' : ''))}
        onChange={handleSelectChange}
        className={fieldClassName ?? "w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs cursor-pointer focus:ring-2 focus:ring-accent-500 focus:outline-none"}
      >
        <option value="" disabled>-- {placeholder} --</option>
        {groups.map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map(room => (
              <option key={room.name} value={room.name}>{room.name}</option>
            ))}
          </optgroup>
        ))}
        {match?.status === 'retired' && <option value={match.name}>{match.name} (retired)</option>}
        <option value="CUSTOM">Other / Custom Room...</option>
      </select>

      {(isCustom || (!isKnownRoom && value.trim() !== '')) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type custom room name (e.g. Room 405)"
          aria-label="Custom room name"
          className={fieldClassName ?? "w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium text-xs focus:ring-2 focus:ring-accent-500 focus:outline-none animate-fade-in"}
        />
      )}
    </div>
  );
};
