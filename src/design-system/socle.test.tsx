import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { Button, Chip, Composer, FurrixScope, Loading, Segmented, SendButton, SwipeActions, SwipeDeck, type SwipeDeckHandle } from './index';

afterEach(cleanup);

// Sans animation : la carte sort dès la confirmation.
const reduceMotion = () => vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList);

describe('socle du design system', () => {
  it('annonce un bouton en cours, ignore ses clics et lui laisse le focus', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Envoyer la demande</Button>);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe('Envoyer la demande, en cours');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    btn.focus();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(btn);
  });

  it('laisse cliquer un bouton qui n’est plus en cours', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Envoyer</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Envoyer' }).hasAttribute('aria-busy')).toBe(false);
  });

  it('annonce un chargement de zone', () => {
    render(<Loading label="Chargement des profils…" />);
    expect(screen.getByRole('status').textContent).toContain('Chargement des profils…');
  });

  it('désactive réellement puces et segments', () => {
    const onChange = vi.fn();
    render(<><Chip disabled>Indisponible</Chip><Segmented aria-label="Vue" value="a" onChange={onChange} options={[{ value: 'a', label: 'Cartes' }, { value: 'b', label: 'Carte', disabled: true }]} /></>);
    expect((screen.getByRole('button', { name: 'Indisponible' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Carte' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('limite le message à 2 000 caractères, affiche le reste et bloque l’envoi en cours', () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer value={'a'.repeat(1900)} onChange={() => {}} onSend={onSend} />);
    const input = screen.getByRole('textbox', { name: 'Message' });
    expect(input.getAttribute('maxlength')).toBe('2000');
    expect(input.getAttribute('placeholder')).toBe('Ton message');
    expect(screen.getByText('100 caractères restants')).toBeTruthy();
    rerender(<Composer value="Bonjour" onChange={() => {}} onSend={onSend} sending />);
    const send = screen.getByRole('button', { name: 'Envoyer, en cours' });
    expect(send.getAttribute('aria-busy')).toBe('true');
    fireEvent.submit(input.closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Bonjour');
    rerender(<Composer value="Bonjour" onChange={() => {}} onSend={onSend} />);
    fireEvent.submit(input.closest('form')!);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('bloque un double envoi par le bouton d’envoi seul', () => {
    const onClick = vi.fn();
    render(<SendButton loading onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('isole la base du design system dans un conteneur', () => {
    render(<FurrixScope data-testid="scope">Contenu</FurrixScope>);
    expect(screen.getByTestId('scope').className).toBe('fx-scope');
  });
});

type Pet = { id: string; name: string };
const pets: Pet[] = [{ id: '1', name: 'Luna' }, { id: '2', name: 'Pistache' }];

function Deck({ decide }: { decide: (p: Pet) => Promise<void | boolean> | boolean | void }) {
  const ref = useRef<SwipeDeckHandle>(null);
  const [pending, setPending] = useState(false);
  return (
    <>
      <SwipeDeck ref={ref} items={pets} getKey={(p) => p.id} getLabel={(p) => p.name} onDecide={decide} onPendingChange={setPending}
        renderCard={(p) => <p>{p.name}</p>} empty={<p>Pile vide</p>} />
      <SwipeActions subject="ce profil" disabled={pending} onPass={() => ref.current?.pass()} onLike={() => ref.current?.like()} />
    </>
  );
}

describe('pile de profils contrôlée par le serveur', () => {
  it('garde la carte et désactive les actions tant que le serveur n’a pas répondu, puis avance', async () => {
    reduceMotion();
    let resolve!: () => void;
    const decide = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<Deck decide={decide} />);
    fireEvent.click(screen.getByRole('button', { name: "J'aime ce profil" }));
    expect(decide).toHaveBeenCalledWith(pets[0], 'like');
    expect(screen.getByRole('group', { name: 'Luna' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "J'aime ce profil" }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: "J'aime ce profil" }));
    expect(decide).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
    expect(screen.getByRole('group', { name: 'Pistache' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "J'aime ce profil" }).hasAttribute('aria-disabled')).toBe(false);
  });

  it('remet la carte en place si le serveur refuse ou échoue', async () => {
    reduceMotion();
    const decide = vi.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(false).mockReturnValueOnce(false);
    render(<Deck decide={decide} />);
    for (let i = 0; i < 3; i++) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Passer ce profil' })); });
      expect(screen.getByRole('group', { name: 'Luna' })).toBeTruthy();
    }
    expect(decide).toHaveBeenCalledTimes(3);
  });

  it('ne lance pas de glissement depuis un bouton de la carte', () => {
    const decide = vi.fn();
    render(<SwipeDeck items={pets} getKey={(p) => p.id} onDecide={decide} renderCard={(p) => <button type="button">Fiche de {p.name}</button>} />);
    const inner = screen.getByRole('button', { name: 'Fiche de Luna' });
    fireEvent.pointerDown(inner, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(inner, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(inner, { clientX: 200, pointerId: 1 });
    expect(decide).not.toHaveBeenCalled();
  });
});
