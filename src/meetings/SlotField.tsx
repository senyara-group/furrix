import { useEffect, useRef, useState } from 'react';
import { Icon } from '../design-system';
import './slot-field.css';

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** « Sam. 22 nov., 10:00 » */
export const longSlot = (iso: string) => cap(new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)));
const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));

/* Créneaux : heure locale « AAAA-MM-JJTHH:MM », convertie en ISO à l'envoi. */
export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nextSlotInput = () => `${dayKey(new Date(Date.now() + 2 * 86400_000))}T10:00`;
const HOURS = Array.from({ length: 12 }, (_, i) => `${pad(8 + i)}:00`);
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const monthName = (d: Date) => cap(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d));
const validSlot = (s: string) => !!s && !Number.isNaN(new Date(s).getTime());

/** Un créneau : le champ ouvre un petit calendrier (jour puis heure) sous lui. */
export function SlotField({ value, onChange, label, min, placeholder = 'Choisir un jour et une heure' }: {
  value: string; onChange: (slot: string) => void; label: string;
  /** Créneau local « AAAA-MM-JJTHH:MM » : seuls les créneaux après lui sont proposés (fin d'une garde). */
  min?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const initial = validSlot(value) ? new Date(value) : min && validSlot(min) ? new Date(min) : new Date(today.getTime() + 2 * 86400_000);
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [picked, setPicked] = useState(() => dayKey(initial));
  const [step, setStep] = useState<'day' | 'hour'>('day');
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => {
    const from = validSlot(value) ? value : min && validSlot(min) ? min : '';
    if (!open && from) { const d = new Date(from); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setPicked(dayKey(d)); }
    setStep('day');
    setOpen((o) => !o);
  };
  const lead = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const now = Math.max(Date.now(), min && validSlot(min) ? new Date(min).getTime() : 0);
  const pickedDate = new Date(`${picked}T00:00`);
  return <div className="am-slotfield" ref={box}>
    <button type="button" className="fx-input am-slotbtn" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
      <Icon name="calendar" size={18} />
      <span className={validSlot(value) ? 'fx-num' : 'am-placeholder'}>{validSlot(value) ? longSlot(new Date(value).toISOString()) : placeholder}</span>
    </button>
    {open && step === 'hour' ? <div className="am-cal" role="dialog" aria-label={`${label} : heure`}>
      <div className="am-cal__head">
        <button type="button" className="am-cal__nav" aria-label="Changer de jour" onClick={() => setStep('day')}>‹</button>
        <b>{cap(day(pickedDate.toISOString()))}</b>
        <span className="am-cal__spacer" aria-hidden="true" />
      </div>
      <p className="am-cal__label">Choisis l’heure</p>
      <div className="am-cal__hours" role="group" aria-label="Heure">
        {HOURS.map((h) => { const slot = `${picked}T${h}`; return <button key={h} type="button" className="am-cal__hour fx-num"
          aria-pressed={value === slot} disabled={new Date(slot).getTime() <= now} onClick={() => { onChange(slot); setOpen(false); }}>{h}</button>; })}
      </div>
    </div> : open ? <div className="am-cal" role="dialog" aria-label={`${label} : jour`}>
      <div className="am-cal__head">
        <button type="button" className="am-cal__nav" aria-label="Mois précédent" disabled={month <= thisMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{monthName(month)}</b>
        <button type="button" className="am-cal__nav" aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="am-cal__grid" role="group" aria-label="Jour">
        {WEEKDAYS.map((w, i) => <span key={i} className="am-cal__wd" aria-hidden="true">{w}</span>)}
        {cells.map((d, i) => d ? <button key={i} type="button" className="am-cal__day fx-num" aria-pressed={dayKey(d) === picked}
          aria-label={new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)}
          data-today={dayKey(d) === dayKey(today) || undefined} disabled={d < today || HOURS.every((h) => new Date(`${dayKey(d)}T${h}`).getTime() <= now)}
          onClick={() => { setPicked(dayKey(d)); setStep('hour'); }}>{d.getDate()}</button>
          : <span key={i} />)}
      </div>
    </div> : null}
  </div>;
}
