import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Alert, Button, ChipGroup, Composer, Field, IconButton, Input, StatusBadge, Steps, iconNames } from './index';

afterEach(cleanup);

describe('design system Plein air', () => {
  it('marque un seul style d’action principale et un type bouton par défaut', () => {
    render(<Button>Envoyer la demande</Button>);
    const btn = screen.getByRole('button', { name: 'Envoyer la demande' });
    expect(btn.className).toContain('fx-btn--main');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('donne un nom accessible aux boutons à pictogramme', () => {
    render(<IconButton icon="sliders" label="Filtres" />);
    expect(screen.getByRole('button', { name: 'Filtres' })).toBeTruthy();
  });

  it('relie étiquette, aide et erreur au champ', () => {
    render(<Field label="Prénom" hint="Aide" error="Indiquez le prénom"><Input /></Field>);
    const input = screen.getByLabelText('Prénom');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errId = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(errId)?.textContent).toContain('Indiquez le prénom');
  });

  it('n’envoie pas un message vide', () => {
    const onSend = vi.fn();
    render(<Composer value="  " onChange={() => {}} onSend={onSend} />);
    expect((screen.getByRole('button', { name: 'Envoyer' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('bascule les puces en choix multiple', () => {
    function Demo() {
      const [v, setV] = useState<string[]>([]);
      return <ChipGroup multiple value={v} onChange={setV} options={[{ value: 'a', label: 'Balade' }, { value: 'b', label: 'Jeu' }]} />;
    }
    render(<Demo />);
    const chip = screen.getByRole('button', { name: 'Balade' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('écrit toujours le statut en texte et annonce les erreurs', () => {
    render(<><StatusBadge status="wait">En attente de Sam</StatusBadge><Alert tone="err" title="La demande n’est pas partie" /></>);
    expect(screen.getByText('En attente de Sam')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('La demande n’est pas partie');
  });

  it('annonce l’étape en cours', () => {
    render(<Steps steps={[{ label: 'Demande', state: 'done' }, { label: 'Réponse', state: 'now' }]} />);
    expect(screen.getByText('Réponse').closest('li')?.getAttribute('aria-current')).toBe('step');
  });

  it('expose tous les pictogrammes du design system', () => {
    expect(iconNames).toContain('paw');
    expect(iconNames).toContain('heartFill');
    expect(iconNames).toHaveLength(33);
  });
});
