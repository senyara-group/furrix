import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { PetRow } from '../types/database';
import type { PetFormValues } from '../types/pet';
import { PET_SPECIES, PET_GENDERS, PET_PURPOSES } from '../types/pet';
import { PET_LIMITS, validatePetForm } from '../validation/pet';
import { createPet, updatePet } from '../services/pets';
import { replacePetPhoto } from '../services/petPhotoFlow';
import { validatePhotoFile } from '../services/petPhotos';
import { toDataError } from '../services/errors';
import type { FurrixClient } from '../services/supabaseClient';
import { PetPhoto } from './PetPhoto';
import { Alert, Button, EmptyState, Field, FurrixScope, Input, Select, Textarea } from '../design-system';
import './pets.css';

const labels: Record<string, string> = { chien: 'Chien', chat: 'Chat', lapin: 'Lapin', oiseau: 'Oiseau', reptile: 'Reptile', rongeur: 'Rongeur', cheval: 'Cheval', ferme: 'Animal de ferme', balade: 'Balades', social: 'Socialisation', reproduction: 'Reproduction', show: 'Expositions', '♂': 'Mâle', '♀': 'Femelle' };
const blank: PetFormValues = { name: '', species: '', breed: '', age: '', gender: '', city: '', bio: '', purpose: '' };
const fromPet = (pet: PetRow): PetFormValues => Object.fromEntries(Object.keys(blank).map((key) => [key, pet[key as keyof PetFormValues] ?? ''])) as PetFormValues;

function PetEditor({ client, ownerId, pet, onSaved, onCancel }: { client: FurrixClient; ownerId: string; pet: PetRow | null; onSaved: (pet: PetRow) => void; onCancel: () => void }) {
  const [values, setValues] = useState<PetFormValues>(() => pet ? fromPet(pet) : { ...blank });
  const [errors, setErrors] = useState<Partial<Record<keyof PetFormValues, string>>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draftId] = useState(() => crypto.randomUUID());
  const alive = useRef(true), saving = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const field = (key: keyof PetFormValues) => ({ id: `pet-${key}`, name: key, value: values[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value })) });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving.current) return;
    const parsed = validatePetForm(values); setError('');
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    setErrors({}); saving.current = true; setBusy(true);
    try {
      const saved = pet ? await updatePet(client, pet.id, parsed.value) : await createPet(client, ownerId, parsed.value, draftId);
      if (alive.current) onSaved(saved);
    } catch (e) { if (alive.current) setError(`${toDataError(e).message}${!pet ? ' Si la réponse a été perdue, recharge la liste avant de réessayer pour éviter un doublon.' : ''}`); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  return <FurrixScope className="pet-editor"><Button variant="out" size="sm" onClick={onCancel} disabled={busy}><ArrowLeft size={18} aria-hidden /> Mes animaux</Button><p className="app-eyebrow">Un compagnon, une histoire</p><h1>{pet ? `Le profil de ${pet.name}` : 'Fais les présentations.'}</h1><p>Ses informations, pour mieux préparer la suite. La photo s’ajoute après l’enregistrement.</p>
    <form onSubmit={(e) => { void submit(e); }} noValidate><fieldset disabled={busy}><legend>Informations de l’animal</legend><div className="pet-fields">
      <Field label="Son nom *" error={errors.name}><Input {...field('name')} maxLength={PET_LIMITS.name} autoComplete="off" required /></Field>
      <Field label="Espèce *" error={errors.species}><Select {...field('species')} required><option value="">Choisir une espèce</option>{PET_SPECIES.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</Select></Field>
      <Field label="Race ou type *" error={errors.breed}><Input {...field('breed')} maxLength={PET_LIMITS.breed} placeholder="Ex. croisé, européen…" required /></Field>
      <Field label="Sexe *" error={errors.gender}><Select {...field('gender')} required><option value="">Choisir</option>{PET_GENDERS.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</Select></Field>
      <Field label="Âge" error={errors.age}><Input {...field('age')} maxLength={PET_LIMITS.age} placeholder="Ex. 3 ans" /></Field>
      <Field label="Ville *" error={errors.city}><Input {...field('city')} maxLength={PET_LIMITS.city} autoComplete="address-level2" required /></Field>
      <Field label="Objectif *" error={errors.purpose}><Select {...field('purpose')} required><option value="">Choisir un objectif</option>{PET_PURPOSES.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</Select></Field>
      <Field className="pet-full" label="Quelques mots sur lui" error={errors.bio}><Textarea {...field('bio')} maxLength={PET_LIMITS.bio} rows={4} placeholder="Son caractère, ses habitudes…" /></Field>
    </div><p className="app-small">* Champs requis. Les objectifs reprennent les valeurs actuelles de la base ; aucun service de rencontre ou de reproduction n’est ouvert.</p><div className="pet-actions"><Button type="submit" loading={busy}>Enregistrer le profil</Button><Button variant="out" onClick={onCancel}>Annuler</Button></div></fieldset>{error && <Alert tone="err" title={error} />}</form>
  </FurrixScope>;
}

function PetCard({ client, pet, ownerId, edit, onSaved }: { client: FurrixClient; pet: PetRow; ownerId: string; edit: () => void; onSaved: (pet: PetRow) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(true), uploading = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const upload = async (file?: File) => {
    if (!file || uploading.current) return;
    const problem = validatePhotoFile(file); if (problem) { setMessage(problem); return; }
    uploading.current = true; setBusy(true); setMessage('');
    try {
      const result = await replacePetPhoto(client, { userId: ownerId, pet, file });
      if (!alive.current) return;
      onSaved(result.pet);
      setMessage(result.status === 'saved' ? 'Photo enregistrée.' : `${result.error.message} La photo précédente est conservée lorsque son état est confirmé.`);
    } catch { if (alive.current) setMessage('La photo n’a pas pu être enregistrée. Recharge la liste avant de réessayer.'); }
    finally { uploading.current = false; if (alive.current) setBusy(false); }
  };
  return <article className="pet-card"><PetPhoto client={client} pet={pet} /><div className="pet-card-body"><p className="app-eyebrow">{labels[pet.species] || pet.species}{pet.age ? ` · ${pet.age}` : ''}</p><h2>{pet.name}</h2><p>{pet.breed || 'Race non renseignée'} · {pet.city || 'Ville non renseignée'}</p>{pet.bio && <p className="pet-bio">{pet.bio}</p>}<p className="app-small">{pet.purpose ? `Objectif : ${labels[pet.purpose] || pet.purpose}` : 'Objectif non renseigné'}</p><div className="pet-actions"><Button variant="out" size="sm" disabled={busy} onClick={edit}>Modifier le profil de {pet.name}</Button><label className="pet-upload fx-btn fx-btn--ink fx-btn--sm" aria-busy={busy || undefined}>{busy ? 'Envoi…' : pet.photos?.length ? 'Remplacer la photo' : 'Ajouter une photo'}<input aria-label={`Photo de ${pet.name}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></label></div><p className="app-small">Photo principale privée · JPEG, PNG ou WebP · 5 Mo maximum. HEIC non pris en charge. Le remplacement retire les anciennes photos de ce profil.</p>{message && <p role="status" className="pet-message">{message}</p>}</div></article>;
}

export default function PetsWorkspace({ client, ownerId, pets, onSaved, reload }: { client: FurrixClient; ownerId: string; pets: PetRow[]; onSaved: (pet: PetRow) => void; reload: () => void }) {
  const [editing, setEditing] = useState<PetRow | null | undefined>();
  const [notice, setNotice] = useState('');
  if (editing !== undefined) return <PetEditor key={editing?.id || 'new'} client={client} ownerId={ownerId} pet={editing} onCancel={() => setEditing(undefined)} onSaved={(pet) => { onSaved(pet); setEditing(undefined); setNotice(`Le profil de ${pet.name} est enregistré.`); }} />;
  return <FurrixScope className="app-page pet-workspace"><div className="pet-heading"><div><p className="app-eyebrow">Ceux qui partagent ta vie</p><h1>Mes animaux</h1><p>Leur caractère, leurs habitudes, leur petite bouille.</p></div><Button onClick={() => { setNotice(''); setEditing(null); }}><Plus size={18} aria-hidden />Ajouter un animal</Button></div>{notice && <Alert tone="ok" title={notice} />}{pets.length ? <div className="pet-grid">{pets.map((pet) => <PetCard key={pet.id} client={client} pet={pet} ownerId={ownerId} edit={() => { setNotice(''); setEditing(pet); }} onSaved={onSaved} />)}</div> : <EmptyState icon="paw" title="Chaque aventure commence avec eux.">Aucun animal n’est encore associé à cet espace. Ajoute son premier profil pour faire les présentations.</EmptyState>}<Button variant="quiet" size="sm" className="pet-reload" onClick={reload}>Recharger la liste</Button></FurrixScope>;
}
