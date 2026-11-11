import React, { useEffect, useState } from 'react';
import { Archive, DoorOpen, MapPin, Navigation, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { ListToolbar } from '../../components/FilterBars';
import { Modal } from '../../components/Modal';
import { showFeedback } from '../../components/FeedbackCenter';
import { LocationPicker } from '../../components/LocationPicker';
import { cleanRadiusText, parseRadius, RADIUS_RANGE_ERROR } from '../../utils/geofenceRadius';
import {
  ApiError,
  createRoomApi,
  createRoomCategoryApi,
  deleteRoomApi,
  deleteRoomCategoryApi,
  getAdminRoomsApi,
  renameRoomCategoryApi,
  restoreRoomApi,
  restoreRoomCategoryApi,
  retireRoomApi,
  retireRoomCategoryApi,
  updateRoomApi,
  type RoomCategory,
  type RoomRecord,
  type RoomUsage,
} from '../../services/apiClient';

const NEW_CATEGORY = '__new__';
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
const isUsed = (u: RoomUsage) => u.classes + u.meetings + u.scheduledSessions > 0;
const usedBy = (u: RoomUsage) => {
  const parts = [
    u.classes > 0 ? plural(u.classes, 'class', 'classes') : '',
    u.scheduledSessions > 0 ? plural(u.scheduledSessions, 'session') : '',
  ].filter(Boolean);
  if (parts.length === 0 && u.meetings > 0) parts.push(plural(u.meetings, 'class meeting'));
  return parts.length ? `Used by ${parts.join(' · ')}` : 'Never used';
};

// What a rename changes; zero parts are left out.
const renameChanges = (u: RoomUsage) => [
  u.classes > 0 ? plural(u.classes, 'class', 'classes') : '',
  u.meetings > 0 ? plural(u.meetings, 'class meeting') : '',
  u.scheduledSessions > 0 ? plural(u.scheduledSessions, 'scheduled session') : '',
].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1');

type Draft = {
  roomId?: number;
  name: string;
  categoryId: string; // an active category id, or NEW_CATEGORY
  newCategory: string;
  lat: string;
  lng: string;
  radius: string;
  original?: RoomRecord;
};
type Confirm =
  | { kind: 'retire' | 'delete'; room: RoomRecord }
  | { kind: 'rename'; room: RoomRecord; to: string; usage: RoomUsage }
  | { kind: 'retireCategory' | 'deleteCategory'; category: RoomCategory };
type CategoryDraft = { categoryId?: number; name: string };

export const Rooms: React.FC = () => {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [tab, setTab] = useState<'rooms' | 'retired'>('rooms');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [catDraft, setCatDraft] = useState<CategoryDraft | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = async () => {
    const result = await getAdminRoomsApi();
    setRooms(result.rooms);
    setCategories(result.categories);
  };
  useEffect(() => {
    load()
      .catch(err => showFeedback(err instanceof Error ? err.message : 'Unable to load rooms.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const openDraft = (room?: RoomRecord) => {
    setError('');
    setShowMap(false);
    setDraft({
      roomId: room?.roomId,
      name: room?.name ?? '',
      categoryId: String(room?.categoryId ?? categories.find(c => c.status === 'active')?.categoryId ?? NEW_CATEGORY),
      newCategory: '',
      lat: room?.latitude != null ? String(room.latitude) : '',
      lng: room?.longitude != null ? String(room.longitude) : '',
      radius: room?.radiusMeters != null ? String(room.radiusMeters) : '',
      original: room,
    });
  };

  const run = async (action: () => Promise<unknown>, done: string, opts: { close?: () => void; toRooms?: boolean } = {}) => {
    const close = opts.close ?? (() => setConfirm(null));
    setBusy(true);
    try {
      await action();
      close();
      showFeedback(done, 'success');
      if (opts.toRooms) setTab('rooms');
      await load();
    } catch (err) {
      close();
      showFeedback(err instanceof Error ? err.message : 'Unable to save the room.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async () => {
    if (!catDraft) return;
    const name = catDraft.name.trim().replace(/\s+/g, ' ');
    if (!name) { setError('Enter the category name.'); return; }
    setBusy(true);
    setError('');
    try {
      if (catDraft.categoryId === undefined) await createRoomCategoryApi(name);
      else await renameRoomCategoryApi(catDraft.categoryId, name);
      showFeedback(catDraft.categoryId === undefined ? `${name} added.` : `${name} saved.`, 'success');
      setCatDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the category.');
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
    const newCategory = draft.newCategory.trim().replace(/\s+/g, ' ');
    if (!name || (draft.categoryId === NEW_CATEGORY && !newCategory)) { setError('Enter the room name and its category.'); return; }
    const hasLat = draft.lat.trim() !== '';
    const hasLng = draft.lng.trim() !== '';
    if (hasLat !== hasLng) { setError('Enter both latitude and longitude, or neither.'); return; }
    if (hasLat && !draftLocation) { setError('Latitude and longitude must be numbers.'); return; }
    const radius = draft.radius.trim() === '' ? null : parseRadius(draft.radius);
    if (draft.radius.trim() !== '' && radius === null) { setError(RADIUS_RANGE_ERROR); return; }
    setBusy(true);
    setError('');
    try {
      // "New category…" creates the category first, then the room.
      const categoryId = draft.categoryId === NEW_CATEGORY
        ? (await createRoomCategoryApi(newCategory)).category.categoryId
        : Number(draft.categoryId);
      const body = {
        name,
        categoryId,
        latitude: draftLocation?.latitude ?? null,
        longitude: draftLocation?.longitude ?? null,
        radiusMeters: draftLocation ? radius : null,
      };
      if (draft.roomId === undefined) {
        await createRoomApi(body);
        showFeedback(`${name} added.`, 'success');
      } else {
        const result = await updateRoomApi({ roomId: draft.roomId, ...body, ...(confirmRename ? { confirmRename: true } : {}) });
        showFeedback(
          result.renamed && isUsed(result.renamed) ? `${name} saved. Updated ${renameChanges(result.renamed)}.` : `${name} saved.`,
          'success',
        );
      }
      setDraft(null);
      setConfirm(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'ROOM_RENAME_CONFIRM' && draft.original) {
        const usage = err.details?.usage as RoomUsage;
        // Only ask when something changes; sessions that already ran keep the old name.
        if (!usage || !isUsed(usage)) return await saveDraft(true);
        setConfirm({ kind: 'rename', room: draft.original, to: name, usage });
      } else {
        setConfirm(null);
        setError(err instanceof Error ? err.message : 'Unable to save the room.');
      }
    } finally {
      setBusy(false);
    }
  };

  const activeCount = rooms.filter(room => room.status === 'active').length;
  const retiredRooms = rooms.length - activeCount;
  const retiredCategories = categories.filter(c => c.status === 'retired').length;
  const retiredUsage = (u: RoomUsage) => {
    const parts = [
      u.classes > 0 ? plural(u.classes, 'class', 'classes') : '',
      u.scheduledSessions > 0 ? plural(u.scheduledSessions, 'scheduled session') : '',
    ].filter(Boolean);
    return parts.join(' and ');
  };
  // Rooms tab: active categories. Retired tab: retired categories, plus active ones that have retired rooms.
  const cards = categories
    .map(cat => {
      const all = rooms.filter(r => r.categoryId === cat.categoryId);
      return { cat, all, shown: all.filter(r => (r.status === 'active') === (tab === 'rooms')) };
    })
    .filter(({ cat, shown }) => (tab === 'rooms' ? cat.status === 'active' : cat.status === 'retired' || shown.length > 0));

  return (
    <section id="rooms" className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="space-y-2 px-1.5">
        <p className="max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          The rooms Faculty and Secretaries pick for classes and sessions. A retired room leaves the lists, and the Faculty using it are told to pick another room. Once nothing uses it, it can be deleted.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <b className="text-slate-800 dark:text-slate-100">{activeCount}</b> active · {retiredRooms} retired · {plural(categories.length, 'category', 'categories')}
        </p>
      </div>

      <ListToolbar
        left={(
          <Tabs
            variant="switch"
            color="accent"
            label="Room views"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'rooms', label: 'Rooms', icon: <DoorOpen className="w-4 h-4" />, count: activeCount },
              { id: 'retired', label: 'Retired', icon: <Archive className="w-4 h-4" />, count: retiredRooms + retiredCategories },
            ]}
          />
        )}
        right={(
          <>
            <button
              type="button"
              disabled={loading || busy}
              className="inline-flex h-11 min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => { setError(''); setCatDraft({ name: '' }); }}
            >
              Add category
            </button>
            <button
              type="button"
              disabled={loading || busy}
              className="inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 text-xs font-bold text-white shadow-xs transition-all hover:bg-accent-700 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => openDraft()}
            >
              <Plus className="w-4 h-4" />
              Add room
            </button>
          </>
        )}
      />

      {loading ? (
        <div role="status" className="p-12 text-center text-sm font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">Loading rooms…</div>
      ) : cards.length === 0 ? (
        <div className="p-12 text-center text-sm font-medium text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          {tab === 'retired' ? 'Nothing is retired.' : 'No rooms yet. Add the first room.'}
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map(({ cat, all, shown }) => {
            const catRetired = cat.status === 'retired';
            const retiredInCat = all.filter(r => r.status === 'retired').length;
            const activeInCat = all.length - retiredInCat;
            const hint = `Retire or move its ${plural(activeInCat, 'room')} first`;
            const subtitle = tab === 'rooms'
              ? `${plural(shown.length, 'room')}${retiredInCat > 0 ? ` · ${retiredInCat} in Retired` : ''}`
              : catRetired ? `Retired category · ${plural(all.length, 'room')}` : 'Category is active';
            return (
              <div key={cat.categoryId} data-testid={`group-${cat.name}`} className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-4 py-3.5 dark:bg-slate-950/30 sm:px-5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{cat.name}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">{subtitle}</span>
                    {tab === 'rooms' && !catRetired && activeInCat > 0 && <span className="block w-full text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
                  </div>
                  {(tab === 'rooms' || catRetired) && (
                    <div className="flex shrink-0 items-center gap-2">
                      {catRetired ? (
                        <button type="button" aria-label={`Restore category ${cat.name}`} title={`Restore category ${cat.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={busy} onClick={() => run(() => restoreRoomCategoryApi(cat.categoryId), `${cat.name} restored.`, { close: () => undefined, toRooms: true })}><RotateCcw className="h-4 w-4" /></button>
                      ) : (
                        <>
                          <button type="button" aria-label={`Rename category ${cat.name}`} title={`Rename category ${cat.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={busy} onClick={() => { setError(''); setCatDraft({ categoryId: cat.categoryId, name: cat.name }); }}><Pencil className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Retire category ${cat.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={busy || activeInCat > 0} title={activeInCat > 0 ? hint : `Retire category ${cat.name}`} onClick={() => setConfirm({ kind: 'retireCategory', category: cat })}><Archive className="h-4 w-4" /></button>
                        </>
                      )}
                      {all.length === 0 && (
                        <button type="button" aria-label={`Delete category ${cat.name}`} title={`Delete category ${cat.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40" disabled={busy} onClick={() => setConfirm({ kind: 'deleteCategory', category: cat })}><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/20 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                  {all.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:col-span-2 xl:col-span-3">No rooms yet. Add a room and pick this category.</p>}
                  {all.length > 0 && shown.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:col-span-2 xl:col-span-3">All rooms here are retired. They are in the Retired tab.</p>}
                  {shown.map(room => {
                    const retired = room.status === 'retired';
                    const hasLocation = room.latitude != null && room.longitude != null;
                    return (
                      <article
                        key={room.roomId}
                        data-testid={`room-${room.name}`}
                        className="flex min-h-44 min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-colors hover:border-accent-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className={`text-sm font-extrabold ${retired ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>{room.name}</h3>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide inline-flex items-center gap-1.5 border ${retired ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200/60' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${retired ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                            {retired ? 'Retired' : 'Active'}
                          </span>
                        </div>
                        <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          <p className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{hasLocation ? `Location set${room.radiusMeters ? ` · ${room.radiusMeters} m` : ''}` : 'No location'}</p>
                          <p>{usedBy(room.usage)}</p>
                        </div>
                        {retired && !room.deletable && (
                          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                            {`${usedBy(room.usage)}. Move ${room.usage.classes + room.usage.meetings + room.usage.scheduledSessions === 1 ? 'it' : 'them'} to another room first; then it can be deleted.`}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          {retired ? (
                            <>
                              <button
                                type="button"
                                aria-label={`Restore room ${room.name}`}
                                title={`Restore room ${room.name}`}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                disabled={busy}
                                onClick={() => run(() => restoreRoomApi(room.roomId), `${room.name} restored.`, { close: () => undefined, toRooms: true })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                              {room.deletable ? (
                                <button
                                  type="button"
                                  aria-label={`Delete room ${room.name}`}
                                  title={`Delete room ${room.name}`}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  disabled={busy}
                                  onClick={() => setConfirm({ kind: 'delete', room })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <button type="button" disabled aria-label={`Delete room ${room.name} unavailable`} title="In use, so it cannot be deleted yet." className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500 cursor-not-allowed"><Trash2 className="h-4 w-4" /></button>
                              )}
                            </>
                          ) : (
                            <>
                              <button type="button" aria-label={`Edit room ${room.name}`} title={`Edit room ${room.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={busy} onClick={() => openDraft(room)}><Pencil className="h-4 w-4" /></button>
                              <button type="button" aria-label={`Retire room ${room.name}`} title={`Retire room ${room.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" disabled={busy} onClick={() => setConfirm({ kind: 'retire', room })}><Archive className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Rename category */}
      <Modal isOpen={catDraft !== null} onClose={() => { if (!busy) setCatDraft(null); }} title={catDraft?.categoryId === undefined ? 'Add Category' : 'Rename Category'}>
        {catDraft && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveCategory(); }}>
            {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Category Name
              <input required maxLength={100} className={inputClass} value={catDraft.name} onChange={e => setCatDraft({ ...catDraft, name: e.target.value })} />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="button" disabled={busy} className={cancelButtonClass} onClick={() => setCatDraft(null)}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : 'Save category'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Add / Edit room */}
      <Modal isOpen={draft !== null} onClose={() => { if (!busy) setDraft(null); }} title={draft?.roomId === undefined ? 'Add Room' : 'Edit Room'}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={event => { event.preventDefault(); void saveDraft(); }}
          >
            {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Room Name
              <input required maxLength={100} className={inputClass} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Category
              <select className={inputClass} value={draft.categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value })}>
                {categories.filter(c => c.status === 'active').map(c => <option key={c.categoryId} value={String(c.categoryId)}>{c.name}</option>)}
                <option value={NEW_CATEGORY}>New category…</option>
              </select>
            </label>
            {draft.categoryId === NEW_CATEGORY && (
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                New Category Name
                <input required maxLength={100} className={inputClass} value={draft.newCategory} onChange={e => setDraft({ ...draft, newCategory: e.target.value })} />
              </label>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-3">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Location <span className="font-medium text-slate-500 dark:text-slate-400">(optional; fills the session location when this room is picked)</span></p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block flex-1 min-w-[8rem] text-xs font-bold text-slate-700 dark:text-slate-300">
                  Allowed Radius (meters)
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
        title={
          confirm?.kind === 'retire' ? 'Retire Room'
            : confirm?.kind === 'delete' ? 'Delete Room'
              : confirm?.kind === 'retireCategory' ? 'Retire Category'
                : confirm?.kind === 'deleteCategory' ? 'Delete Category'
                  : 'Rename Room'
        }
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {confirm.kind === 'retire' && (
                confirm.room.inUse
                  ? `Retire ${confirm.room.name}? Used by ${retiredUsage(confirm.room.usage) || plural(confirm.room.usage.meetings, 'class meeting')}. They keep it and will show a warning. Each Faculty using it is notified to change the room. You can restore it later.`
                  : `Retire ${confirm.room.name}? It will disappear from room lists. You can restore it later.`
              )}
              {confirm.kind === 'delete' && `Delete ${confirm.room.name} for good? Past classes and sessions keep the name. This cannot be undone.`}
              {confirm.kind === 'rename' && `Renaming ${confirm.room.name} changes ${renameChanges(confirm.usage)} this school year. Past school years and sessions that already ran keep the old name. Each affected Faculty is notified.`}
              {confirm.kind === 'retireCategory' && `Retire ${confirm.category.name}? You can restore it later.`}
              {confirm.kind === 'deleteCategory' && `Delete ${confirm.category.name}? This cannot be undone.`}
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
              {confirm.kind === 'retireCategory' && (
                <button type="button" disabled={busy} className={dangerButtonClass} onClick={() => run(() => retireRoomCategoryApi(confirm.category.categoryId), `${confirm.category.name} retired.`)}>Retire category</button>
              )}
              {confirm.kind === 'deleteCategory' && (
                <button type="button" disabled={busy} className={dangerButtonClass} onClick={() => run(() => deleteRoomCategoryApi(confirm.category.categoryId), `${confirm.category.name} deleted.`)}>Delete category</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
};

export default Rooms;
