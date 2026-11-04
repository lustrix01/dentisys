import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, DoorOpen, MapPin, Navigation, Plus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { LocationPicker } from '../../components/LocationPicker';
import { cleanRadiusText, parseRadius, RADIUS_RANGE_ERROR } from '../../utils/geofenceRadius';
import {
  ApiError,
  createRoomApi,
  deleteRoomApi,
  getAdminRoomsApi,
  restoreRoomApi,
  retireRoomApi,
  updateRoomApi,
  type RoomRecord,
  type RoomUsage,
} from '../../services/apiClient';

const NEW_GROUP = '__new__';
const inputClass =
  'mt-1.5 min-w-0 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all';
const primaryButtonClass =
  'rounded-xl px-4 py-2 text-xs font-bold bg-accent-600 hover:bg-accent-700 text-white shadow-xs hover:shadow-md transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
const dangerButtonClass =
  'rounded-xl px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
const outlineButtonClass =
  'rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
const cancelButtonClass =
  'px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sessionCount = (u: RoomUsage) => u.scheduledSessions + u.otherSessions;
const isUsed = (u: RoomUsage) => u.classes + u.meetings + sessionCount(u) > 0;
const usedBy = (u: RoomUsage) => {
  const parts = [
    u.classes > 0 ? plural(u.classes, 'class', 'classes') : '',
    sessionCount(u) > 0 ? plural(sessionCount(u), 'session') : '',
  ].filter(Boolean);
  if (parts.length === 0 && u.meetings > 0) parts.push(plural(u.meetings, 'class meeting'));
  return parts.length ? `Used by ${parts.join(' · ')}` : 'Never used';
};

type Draft = {
  roomId?: number;
  name: string;
  group: string; // an existing group, or NEW_GROUP
  newGroup: string;
  lat: string;
  lng: string;
  radius: string;
  original?: RoomRecord;
};
type Confirm =
  | { kind: 'retire' | 'delete'; room: RoomRecord }
  | { kind: 'rename'; room: RoomRecord; to: string; usage: RoomUsage };

export const Rooms: React.FC = () => {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = async () => {
    const result = await getAdminRoomsApi();
    setRooms(result.rooms);
    setGroups(result.groups);
  };
  useEffect(() => {
    load()
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load rooms.'))
      .finally(() => setLoading(false));
  }, []);

  const openDraft = (room?: RoomRecord) => {
    setError('');
    setShowMap(false);
    setDraft({
      roomId: room?.roomId,
      name: room?.name ?? '',
      group: room?.group ?? groups[0] ?? NEW_GROUP,
      newGroup: '',
      lat: room?.latitude != null ? String(room.latitude) : '',
      lng: room?.longitude != null ? String(room.longitude) : '',
      radius: room?.radiusMeters != null ? String(room.radiusMeters) : '',
      original: room,
    });
  };

  const run = async (action: () => Promise<unknown>, done: string, close: () => void = () => setConfirm(null)) => {
    setBusy(true);
    setError('');
    try {
      await action();
      close();
      setMessage(done);
      await load();
    } catch (err) {
      close();
      setMessage('');
      setError(err instanceof Error ? err.message : 'Unable to save the room.');
    } finally {
      setBusy(false);
    }
  };

  const draftLocation = draft && draft.lat.trim() !== '' && draft.lng.trim() !== '' && Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lng))
    ? { latitude: Number(draft.lat), longitude: Number(draft.lng) }
    : null;

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setDraft(d => d && { ...d, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        setLocating(false);
      },
      err => { setError(`Unable to get the device location: ${err.message}`); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const saveDraft = async (confirmRename = false) => {
    if (!draft) return;
    const name = draft.name.trim().replace(/\s+/g, ' ');
    const group = (draft.group === NEW_GROUP ? draft.newGroup : draft.group).trim();
    if (!name || !group) { setError('Enter the room name and its group.'); return; }
    const hasLat = draft.lat.trim() !== '';
    const hasLng = draft.lng.trim() !== '';
    if (hasLat !== hasLng) { setError('Enter both latitude and longitude, or neither.'); return; }
    if (hasLat && !draftLocation) { setError('Latitude and longitude must be numbers.'); return; }
    const radius = draft.radius.trim() === '' ? null : parseRadius(draft.radius);
    if (draft.radius.trim() !== '' && radius === null) { setError(RADIUS_RANGE_ERROR); return; }
    const body = {
      name,
      group,
      latitude: draftLocation?.latitude ?? null,
      longitude: draftLocation?.longitude ?? null,
      radiusMeters: draftLocation ? radius : null,
    };
    setBusy(true);
    setError('');
    try {
      if (draft.roomId === undefined) {
        await createRoomApi(body);
        setMessage(`${name} added.`);
      } else {
        const result = await updateRoomApi({ roomId: draft.roomId, ...body, ...(confirmRename ? { confirmRename: true } : {}) });
        setMessage(
          result.renamed && result.renamed.classes + result.renamed.meetings + result.renamed.scheduledSessions > 0
            ? `${name} saved. Updated ${plural(result.renamed.classes, 'class', 'classes')} and ${plural(result.renamed.scheduledSessions, 'scheduled session')}.`
            : `${name} saved.`,
        );
      }
      setDraft(null);
      setConfirm(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'ROOM_RENAME_CONFIRM' && draft.original) {
        setConfirm({ kind: 'rename', room: draft.original, to: name, usage: err.details?.usage as RoomUsage });
      } else {
        setConfirm(null);
        setError(err instanceof Error ? err.message : 'Unable to save the room.');
      }
    } finally {
      setBusy(false);
    }
  };

  const grouped = [...new Set(rooms.map(room => room.group))].map(group => [group, rooms.filter(room => room.group === group)] as const);
  const activeCount = rooms.filter(room => room.status === 'active').length;
  const retiredUsage = (u: RoomUsage) => {
    const parts = [
      u.classes > 0 ? plural(u.classes, 'class', 'classes') : '',
      u.scheduledSessions > 0 ? plural(u.scheduledSessions, 'scheduled session') : '',
    ].filter(Boolean);
    return parts.join(' and ');
  };

  return (
    <section id="rooms" className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-500/10 to-accent-600/20 text-accent-600 dark:text-accent-400 border border-accent-200/60 dark:border-accent-900/60 flex items-center justify-center shrink-0 shadow-sm">
              <DoorOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Rooms</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                The rooms Faculty and Secretaries pick for classes and sessions. A retired room leaves the lists; classes and sessions that already use it keep it and show a warning.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-accent-600 hover:bg-accent-700 active:scale-95 text-white shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed lg:shrink-0"
            onClick={() => openDraft()}
          >
            <Plus className="w-4 h-4" />
            Add room
          </button>
        </div>
      </div>

      <p className="px-1.5 text-xs text-slate-500 dark:text-slate-400">
        <b className="text-slate-800 dark:text-slate-100">{activeCount}</b> active · {rooms.length - activeCount} retired
      </p>

      {error && !draft && (
        <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div role="status" className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">Loading rooms…</div>
      ) : rooms.length === 0 ? (
        <div className="p-12 text-center text-sm font-medium text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">No rooms yet. Add the first room.</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([group, list]) => (
            <div key={group} data-testid={`group-${group}`} className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
              <div className="px-4 py-3.5 sm:px-5">
                <span className="block text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{group}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{plural(list.length, 'room')}</span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 px-4 sm:px-5 py-1.5">
                {list.map(room => {
                  const retired = room.status === 'retired';
                  const hasLocation = room.latitude != null && room.longitude != null;
                  return (
                    <div
                      key={room.roomId}
                      data-testid={`room-${room.name}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[12rem_6rem_9rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <span className={`text-sm font-bold ${retired ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{room.name}</span>
                      <span className="row-start-1 col-start-2 lg:row-start-auto lg:col-start-auto justify-self-end lg:justify-self-start">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide inline-flex items-center gap-1.5 border ${retired ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${retired ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                          {retired ? 'Retired' : 'Active'}
                        </span>
                      </span>
                      <span className="col-span-2 lg:col-span-1 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" aria-hidden="true" />
                        {hasLocation ? `Location set${room.radiusMeters ? ` · ${room.radiusMeters} m` : ''}` : 'No location'}
                      </span>
                      <span className="col-span-2 lg:col-span-1 text-xs text-slate-500 dark:text-slate-400">{usedBy(room.usage)}</span>
                      <span className="col-span-2 lg:col-span-1 flex flex-wrap items-center justify-end gap-1.5">
                        <button type="button" className={outlineButtonClass} disabled={busy} onClick={() => openDraft(room)}>Edit</button>
                        {retired ? (
                          <>
                            <button
                              type="button"
                              className={outlineButtonClass}
                              disabled={busy}
                              onClick={() => run(() => restoreRoomApi(room.roomId), `${room.name} restored.`, () => undefined)}
                            >
                              Restore
                            </button>
                            {room.deletable ? (
                              <button
                                type="button"
                                className="rounded-xl border border-rose-200 dark:border-rose-900 px-3.5 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 cursor-pointer"
                                disabled={busy}
                                onClick={() => setConfirm({ kind: 'delete', room })}
                              >
                                Delete
                              </button>
                            ) : (
                              <button type="button" disabled title="In use, so it can only stay retired." className="rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 cursor-not-allowed">Delete</button>
                            )}
                          </>
                        ) : (
                          <button type="button" className={outlineButtonClass} disabled={busy} onClick={() => setConfirm({ kind: 'retire', room })}>Retire</button>
                        )}
                      </span>
                      {retired && !room.deletable && (
                        <span className="col-span-2 lg:col-span-5 text-right text-[11px] text-slate-500 dark:text-slate-400">
                          {usedBy(room.usage)} — it can only stay retired.
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit room */}
      <Modal isOpen={draft !== null} onClose={() => { if (!busy) setDraft(null); }} title={draft?.roomId === undefined ? 'Add room' : 'Edit room'}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={event => { event.preventDefault(); void saveDraft(); }}
          >
            {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Room name
              <input required maxLength={100} className={inputClass} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Group
              <select className={inputClass} value={draft.group} onChange={e => setDraft({ ...draft, group: e.target.value })}>
                {groups.map(group => <option key={group} value={group}>{group}</option>)}
                <option value={NEW_GROUP}>New group…</option>
              </select>
            </label>
            {draft.group === NEW_GROUP && (
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                New group name
                <input required maxLength={100} className={inputClass} value={draft.newGroup} onChange={e => setDraft({ ...draft, newGroup: e.target.value })} />
              </label>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-3">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Location <span className="font-medium text-slate-500 dark:text-slate-400">(optional; fills the session location when this room is picked)</span></p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block flex-1 min-w-[8rem] text-xs font-bold text-slate-700 dark:text-slate-300">
                  Allowed radius (meters)
                  <input type="number" min={50} max={2000} className={inputClass} value={draft.radius} onChange={e => setDraft({ ...draft, radius: cleanRadiusText(e.target.value) })} />
                </label>
                <button type="button" onClick={useDeviceLocation} disabled={locating} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-2.5 text-[11px] font-bold text-white disabled:opacity-50">
                  <Navigation className="w-3.5 h-3.5" />{locating ? 'Locating…' : 'Use device location'}
                </button>
                <button type="button" onClick={() => setShowMap(shown => !shown)} className="inline-flex items-center gap-1.5 rounded-xl border border-accent-600 text-accent-700 dark:text-accent-300 px-3 py-2.5 text-[11px] font-bold">
                  <MapPin className="w-3.5 h-3.5" />{showMap ? 'Hide map' : 'Pick on map'}
                </button>
              </div>
              {showMap && (
                <div className="relative z-0">
                  <LocationPicker
                    value={draftLocation}
                    radiusMeters={parseRadius(draft.radius) ?? 100}
                    onChange={loc => setDraft({ ...draft, lat: String(Number(loc.latitude.toFixed(6))), lng: String(Number(loc.longitude.toFixed(6))) })}
                  />
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {draftLocation ? `Location: ${draftLocation.latitude}, ${draftLocation.longitude}` : 'No location set.'}
                {draftLocation && (
                  <button type="button" className="ml-2 font-bold underline" onClick={() => setDraft({ ...draft, lat: '', lng: '', radius: '' })}>Clear</button>
                )}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" disabled={busy} className={cancelButtonClass} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : 'Save room'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Retire / Delete / Rename confirmations */}
      <Modal
        isOpen={confirm !== null}
        onClose={() => { if (!busy) setConfirm(null); }}
        title={confirm?.kind === 'retire' ? 'Retire room' : confirm?.kind === 'delete' ? 'Delete room' : 'Rename room'}
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {confirm.kind === 'retire' && (
                isUsed(confirm.room.usage)
                  ? `Retire ${confirm.room.name}? Used by ${retiredUsage(confirm.room.usage) || plural(confirm.room.usage.meetings + confirm.room.usage.otherSessions, 'class meeting or session')}. They keep it and will show a warning. You can restore it later.`
                  : `Retire ${confirm.room.name}? It will disappear from room lists. You can restore it later.`
              )}
              {confirm.kind === 'delete' && `Delete ${confirm.room.name} for good? This cannot be undone.`}
              {confirm.kind === 'rename' && `Rename ${confirm.room.name} to ${confirm.to}? This also updates ${plural(confirm.usage?.classes ?? 0, 'class', 'classes')} and ${plural(confirm.usage?.scheduledSessions ?? 0, 'scheduled session')}.`}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" disabled={busy} className={cancelButtonClass} onClick={() => setConfirm(null)}>Cancel</button>
              {confirm.kind === 'retire' && (
                <button type="button" disabled={busy} className={dangerButtonClass} onClick={() => run(() => retireRoomApi(confirm.room.roomId), `${confirm.room.name} retired.`)}>Retire room</button>
              )}
              {confirm.kind === 'delete' && (
                <button type="button" disabled={busy} className={dangerButtonClass} onClick={() => run(() => deleteRoomApi(confirm.room.roomId), `${confirm.room.name} deleted.`)}>Delete room</button>
              )}
              {confirm.kind === 'rename' && (
                <button type="button" disabled={busy} className={primaryButtonClass} onClick={() => void saveDraft(true)}>Rename room</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

export default Rooms;
