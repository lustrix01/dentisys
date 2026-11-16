import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { formatTime12, from12h, nextDigits, parseTypedTime, stepLoop, to12h } from '../utils/sessionTimes';

export type PickerAccent = 'emerald' | 'blue';

// Selected value: accent text; one tinted band behind the middle row spans all three wheels.
const SELECTED: Record<PickerAccent, string> = {
  emerald: 'text-emerald-700 dark:text-emerald-300',
  blue: 'text-blue-700 dark:text-blue-300',
};
const BAND: Record<PickerAccent, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40',
  blue: 'bg-blue-50 dark:bg-blue-950/40',
};

const ROW = 44; // px per value (h-11)
const VISIBLE = [-1, 0, 1];
const FADE = ['opacity-70', '', 'opacity-70'];
const CHEVRON = 'flex h-8 w-full items-center justify-center text-slate-500 dark:text-slate-400';
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const MERIDIEMS = ['AM', 'PM'];

// Only one flyout is open at a time: opening one closes (keeps) the other.
let closeActive: ((open: boolean) => void) | null = null;

interface WheelProps {
  label: string;
  items: string[];
  index: number;
  loop: boolean;
  /** Index change for PageUp/PageDown. */
  page: number;
  onIndex: (index: number) => void;
  /** A typed digit or letter; returns nothing. */
  onType?: (key: string) => void;
  accent: PickerAccent;
}

/** One scrolling column: selected value in a band, one neighbour each side, wheel / drag / arrows / keys. */
const Wheel: React.FC<WheelProps> = ({ label, items, index, loop, page, onIndex, onType, accent }) => {
  const n = items.length;
  const move = (to: number) => onIndex(loop ? stepLoop(to, 0, 0, n - 1) : Math.min(n - 1, Math.max(0, to)));
  const step = (delta: number) => move(index + delta);
  const live = useRef({ step, index });
  live.current = { step, index };
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; acc: number; moved: boolean } | null>(null);

  // React wheel listeners are passive, so the page would scroll too; attach a non-passive one.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => { event.preventDefault(); live.current.step(event.deltaY > 0 ? 1 : -1); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowUp: () => step(-1), ArrowDown: () => step(1), PageUp: () => step(-page), PageDown: () => step(page),
      Home: () => move(0), End: () => move(n - 1),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
    else if (onType && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) onType(event.key);
  };

  const onPointerDown = (event: React.PointerEvent) => { drag.current = { y: event.clientY, acc: 0, moved: false }; };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.acc += event.clientY - d.y;
    d.y = event.clientY;
    if (!d.moved && Math.abs(d.acc) > 6) { d.moved = true; ref.current?.setPointerCapture(event.pointerId); }
    const steps = Math.trunc(d.acc / ROW);
    if (steps) { d.acc -= steps * ROW; step(-steps); }
  };
  const endDrag = () => { window.setTimeout(() => { drag.current = null; }, 0); };

  return (
    <div className="relative min-w-[56px]">
      <button type="button" aria-label={`${label} up`} tabIndex={-1} onClick={() => step(-1)} className={CHEVRON}><ChevronUp className="h-4 w-4" /></button>
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuetext={items[index]}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: 'none' }}
        className="cursor-grab select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        {VISIBLE.map((offset, row) => {
          const i = loop ? stepLoop(index, offset, 0, n - 1) : index + offset;
          if (i < 0 || i >= n) return <div key={offset} className="h-11" />;
          return (
            <div
              key={offset}
              aria-hidden="true"
              onClick={() => { if (offset !== 0 && !drag.current?.moved) step(offset); }}
              className={`flex h-11 items-center justify-center text-center font-bold ${offset === 0 ? SELECTED[accent] : `text-slate-500 dark:text-slate-400 ${FADE[row]}`}`}
            >
              {items[i]}
            </div>
          );
        })}
      </div>
      <button type="button" aria-label={`${label} down`} tabIndex={-1} onClick={() => step(1)} className={CHEVRON}><ChevronDown className="h-4 w-4" /></button>
    </div>
  );
};

interface TimePickerProps {
  /** 'HH:MM' or ''. */
  value: string;
  onChange: (time: string) => void;
  /** The field's accessible name, e.g. "Opening". */
  name: string;
  accent: PickerAccent;
  /** Called when the flyout opens, and instead of restoring this field alone on Cancel (the parent restores every time it shifted). */
  onOpen?: () => void;
  onCancel?: () => void;
}

/** Clock-style time picker: a typed field that opens a flyout with hour, minute and AM/PM wheels (ATT-001 time entry). */
export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, name, accent, onOpen, onCancel }) => {
  const [text, setText] = useState(value ? formatTime12(value) : '');
  const [open, setOpen] = useState(false);
  const start = useRef(value);
  const root = useRef<HTMLDivElement>(null);
  const flyout = useRef<HTMLDivElement>(null);
  const buffer = useRef({ key: '', text: '' });
  useEffect(() => { setText(value ? formatTime12(value) : ''); }, [value]);

  const close = () => setOpen(false);
  const show = () => {
    if (open) return;
    start.current = value;
    onOpen?.();
    if (closeActive && closeActive !== setOpen) closeActive(false);
    closeActive = setOpen;
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); if (closeActive === setOpen) closeActive = null; };
  }, [open]);

  useEffect(() => {
    if (open) flyout.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [open]);

  // Reads the DOM value, not the state, so a commit never works from a stale render.
  const commit = (typed: string) => {
    const parsed = parseTypedTime(typed);
    if (parsed !== null && parsed !== value) onChange(parsed);
    else setText(value ? formatTime12(value) : ''); // unparseable or unchanged: show the saved value again
  };
  const cancel = () => { if (onCancel) onCancel(); else if (value !== start.current) onChange(start.current); setText(start.current ? formatTime12(start.current) : ''); close(); };

  const cur = to12h(value || '08:00');
  const put = (hour: number, minute: number, pm: boolean) => onChange(from12h(hour, minute, pm));
  // Typed digits: "1" then "2" gives 12; a stale buffer (>1.2 s) starts again.
  const typed = (kind: 'hour' | 'minute') => (key: string) => {
    const max = kind === 'hour' ? 12 : 59;
    if (!/^\d$/.test(key)) return;
    const b = buffer.current;
    const fresh = b.key === kind ? b.text : '';
    const next = nextDigits(fresh, key, max);
    buffer.current = { key: kind, text: next };
    window.setTimeout(() => { if (buffer.current.text === next) buffer.current = { key: '', text: '' }; }, 1200);
    const number = Number(next);
    if (kind === 'hour' && number >= 1) put(number, cur.minute, cur.pm);
    if (kind === 'minute') put(cur.hour, number, cur.pm);
  };
  const typedMeridiem = (key: string) => { const k = key.toLowerCase(); if (k === 'a' || k === 'p') put(cur.hour, cur.minute, k === 'p'); };

  return (
    <div
      ref={root}
      onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); cancel(); } }}
    >
      <div className="relative">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        value={text}
        aria-label={name}
        aria-expanded={open}
        onFocus={show}
        onClick={show}
        onChange={event => setText(event.target.value)}
        onBlur={event => commit(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); close(); } }}
        className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <Clock aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {open && (
        <div ref={flyout} role="group" aria-label={`${name} time picker`} className="mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="relative grid grid-cols-3 gap-1">
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-[76px] h-11 rounded-xl ${BAND[accent]}`} />
            <Wheel label="Hour" items={HOURS} index={cur.hour - 1} loop page={3} onIndex={i => put(i + 1, cur.minute, cur.pm)} onType={typed('hour')} accent={accent} />
            <Wheel label="Minute" items={MINUTES} index={cur.minute} loop page={5} onIndex={i => put(cur.hour, i, cur.pm)} onType={typed('minute')} accent={accent} />
            <Wheel label="AM or PM" items={MERIDIEMS} index={cur.pm ? 1 : 0} loop={false} page={1} onIndex={i => put(cur.hour, cur.minute, i === 1)} onType={typedMeridiem} accent={accent} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={cancel} className="min-h-[44px] rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
            <button type="button" onClick={close} className={`min-h-[44px] rounded-xl px-4 py-2 font-bold text-white ${accent === 'blue' ? 'bg-blue-600' : 'bg-emerald-600'}`}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
