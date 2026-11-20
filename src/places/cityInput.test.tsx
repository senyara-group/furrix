import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../design-system';
import { CityInput } from './CityInput';
import type { City } from './cities';

const communes = [
  { nom: 'Lille', codesPostaux: ['59000', '59160'], codeDepartement: '59', centre: { coordinates: [3.0468, 50.6311] } },
  { nom: 'Limoges', codesPostaux: ['87000'], codeDepartement: '87', centre: { coordinates: [1.226, 45.8567] } },
];

function Demo({ onPick }: { onPick: (c: City) => void }) {
  const [value, setValue] = useState('');
  return <Field label="Ville"><CityInput value={value} onChange={setValue} onPick={onPick} /></Field>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CityInput', () => {
  it('propose les communes qui commencent par le texte tapé, et se choisit au clavier', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(communes)));
    const onPick = vi.fn();
    render(<Demo onPick={onPick} />);
    const input = screen.getByRole('combobox', { name: 'Ville' });
    fireEvent.change(input, { target: { value: 'li' } });
    expect(await screen.findByRole('option', { name: /Lille/ })).toBeTruthy();
    expect(String(fetch.mock.calls[0]![0])).toContain('nom=li');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith({ name: 'Lille', postcode: '59000', department: '59', latitude: 50.63, longitude: 3.05 });
    expect((input as HTMLInputElement).value).toBe('Lille');
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
  });

  it('sans réseau, reste une saisie libre', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Demo onPick={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Ville' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Roubaix' } });
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByRole('option')).toBeNull();
    expect(input.value).toBe('Roubaix');
  });
});
