import { useEffect, useRef, useState } from 'react';
import { Button, Alert } from '../design-system';
import { pickNativePetPhoto } from '../platform/nativePhoto';
import { toDataError } from '../services/errors';

/** Le selecteur natif ne televerse rien si la fiche a ete quittee entre-temps. */
export function NativePhotoActions({ busy, onPhoto }: { busy: boolean; onPhoto: (photo: File) => Promise<void> }) {
  const [selecting, setSelecting] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const choose = async (source: 'gallery' | 'camera') => {
    if (running.current || busy) return;
    running.current = true; setSelecting(true); setError('');
    try {
      const file = await pickNativePetPhoto(source);
      if (file && alive.current) await onPhoto(file);
    } catch (cause) { if (alive.current) setError(toDataError(cause).message); }
    finally { running.current = false; if (alive.current) setSelecting(false); }
  };
  return <><Button variant="ink" size="sm" loading={selecting || busy} onClick={() => { void choose('gallery'); }}>Choisir une photo</Button>
    <Button variant="out" size="sm" disabled={selecting || busy} onClick={() => { void choose('camera'); }}>Prendre une photo</Button>
    {error && <Alert tone="err" title={error} />}</>;
}
