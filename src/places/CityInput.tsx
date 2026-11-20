import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from '../design-system';
import { searchCities, type City } from './cities';
import './places.css';

export interface CityInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> {
  value: string;
  onChange: (text: string) => void;
  /** Commune choisie dans la liste (nom officiel, code postal et centre arrondi). */
  onPick?: (city: City) => void;
}

/**
 * Champ ville avec suggestions : dès 2 lettres (ou un code postal complet), les communes correspondantes s'affichent.
 * Clavier : flèches pour parcourir, Entrée pour choisir, Échap pour fermer. Sans réseau, le champ reste une saisie libre.
 * À placer dans un `Field` (l'étiquette, l'aide et l'erreur sont reliées à l'input).
 */
export const CityInput = forwardRef<HTMLInputElement, CityInputProps>(function CityInput(
  { value, onChange, onPick, onKeyDown, onBlur, onFocus, disabled, ...rest }, ref,
) {
  const listId = useId();
  const [options, setOptions] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typing, setTyping] = useState(false);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (!typing || disabled || picked.current === value) { setOptions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchCities(value, controller.signal)
        .then((found) => { setOptions(found); setActive(-1); setOpen(found.length > 0); })
        .catch(() => { if (!controller.signal.aborted) { setOptions([]); setOpen(false); } });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, typing, disabled]);

  const choose = (city: City) => {
    picked.current = city.name;
    setTyping(false); setOpen(false); setOptions([]); setActive(-1);
    onChange(city.name);
    onPick?.(city);
  };
  const expanded = open && options.length > 0;

  return <div className="pl-city">
    <Input
      ref={ref}
      {...rest}
      disabled={disabled}
      value={value}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
      autoComplete="off"
      autoCapitalize="words"
      spellCheck={false}
      maxLength={rest.maxLength ?? 80}
      onChange={(e) => { picked.current = null; setTyping(true); onChange(e.target.value); }}
      onFocus={(e) => { if (options.length) setOpen(true); onFocus?.(e); }}
      onBlur={(e) => { setOpen(false); onBlur?.(e); }}
      onKeyDown={(e) => {
        // Touche gérée par la liste : elle ne remonte pas au formulaire (pas d'envoi en choisissant une ville).
        if (expanded && e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % options.length); return; }
        if (expanded && e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? options.length - 1 : i - 1)); return; }
        if (expanded && e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(options[active]!); return; }
        if (expanded && e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
        onKeyDown?.(e);
      }}
    />
    <ul id={listId} role="listbox" aria-label="Villes proposées" className="pl-city__list" hidden={!expanded}>
      {options.map((city, i) => (
        <li key={`${city.name}-${city.postcode}-${city.department}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
          className="pl-city__opt" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(city)}>
          <span className="pl-city__name">{city.name}</span>
          <span className="pl-city__meta">{[city.postcode, city.department && `(${city.department})`].filter(Boolean).join(' ')}</span>
        </li>
      ))}
    </ul>
  </div>;
});
