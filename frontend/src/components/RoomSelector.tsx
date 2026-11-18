import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getRoomsApi, type RoomOption } from '../services/apiClient';
import { Modal } from './Modal';

/** Names match ignoring case, spaces, dashes and dots. */
export const roomKey = (name: string) => name.toLowerCase().replace(/[\s.\-]+/g, '');

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

const retiredMatch = (rooms: RoomOption[], name: string | null | undefined) =>
  name ? rooms.find(room => room.status === 'retired' && roomKey(room.name) === roomKey(name)) : undefined;

export const isRetiredRoom = (rooms: RoomOption[], name: string | null | undefined) => !!retiredMatch(rooms, name);

/** The message for a picked or typed room that the Dean retired, else null. Uses the room's own name. */
export const retiredRoomError = (rooms: RoomOption[], name: string | null | undefined): string | null => {
  const room = retiredMatch(rooms, name);
  return room ? `${room.name} was retired by the Dean. Pick another room.` : null;
};

/** Yellow warning shown next to a retired room. Shows nothing unless a given room is retired. */
export const RetiredRoomWarning: React.FC<{ rooms: RoomOption[]; names: Array<string | null | undefined> }> = ({ rooms, names }) => {
  const retired = [...new Set(names.map(n => retiredMatch(rooms, n)?.name).filter((n): n is string => !!n))];
  if (retired.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="retired-room-warning">
      {retired.map(name => (
        <p key={name} role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{retiredRoomError(rooms, name)}</span>
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
  placeholder = 'Select room venue',
  id,
  fieldClassName,
  onPickRoom,
}) => {
  const rooms = useRooms();
  const match = rooms.find(room => roomKey(room.name) === roomKey(value));
  const isKnownRoom = !!match;
  const groups = useMemo(() => {
    const map = new Map<string, RoomOption[]>();
    rooms.filter(room => room.status === 'active').forEach(room => map.set(room.group, [...(map.get(room.group) ?? []), room]));
    return [...map.entries()];
  }, [rooms]);
  const [isCustom, setIsCustom] = useState(!isKnownRoom && value.trim() !== '');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState('');

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
      setCustomDraft(isKnownRoom ? '' : value);
      setCustomError('');
      setCustomOpen(true);
    } else {
      setIsCustom(false);
      onChange(val);
      const picked = rooms.find(room => room.status === 'active' && room.name === val);
      if (picked) onPickRoom?.(picked);
    }
  };

  const cancelCustom = () => {
    setCustomOpen(false);
    setCustomError('');
    setIsCustom(!isKnownRoom && value.trim() !== '');
  };

  const saveCustom = () => {
    const place = customDraft.trim();
    if (!place) {
      setCustomError('Enter a room or place name.');
      return;
    }
    onChange(place);
    setIsCustom(true);
    setCustomOpen(false);
    setCustomError('');
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
        <option value="CUSTOM">Other place (custom)…</option>
      </select>

      {isCustom && value.trim() !== '' && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/70">
          <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">Custom place: <strong className="text-slate-800 dark:text-slate-100">{value}</strong></span>
          <button type="button" onClick={() => { setCustomDraft(value); setCustomError(''); setCustomOpen(true); }} className="shrink-0 font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Edit
          </button>
        </div>
      )}
      <Modal isOpen={customOpen} onClose={cancelCustom} title="Custom room or place" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Enter the room or off-site location for this session.</p>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor={`${id ?? 'room'}-custom-name`}>
            Room or place name
            <input
              id={`${id ?? 'room'}-custom-name`}
              type="text"
              maxLength={255}
              autoFocus
              value={customDraft}
              onChange={event => { setCustomDraft(event.target.value); setCustomError(''); }}
              placeholder="e.g. Room 405 or PGH Dental Ward"
              aria-invalid={Boolean(customError)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {customError && <span role="alert" className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-300">{customError}</span>}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelCustom} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
            <button type="button" onClick={saveCustom} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">Save place</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
