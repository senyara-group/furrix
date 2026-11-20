import { Capacitor } from '@capacitor/core';
import { NativePhotoActions } from './NativePhotoActions';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { PetRow } from '../types/database';
import type { PetFormValues } from '../types/pet';
import { PET_SPECIES, PET_GENDERS, PET_PURPOSES, PET_MEETING_GOALS, PET_SIZES } from '../types/pet';
import { PET_LIMITS, PET_MEETING_LIMITS, validatePetForm } from '../validation/pet';
import { createPet, updatePet } from '../services/pets';
import { replacePetPhoto } from '../services/petPhotoFlow';
import { validatePhotoFile } from '../services/petPhotos';
import { toDataError } from '../services/errors';
import type { FurrixClient } from '../services/supabaseClient';
import PetRetirement from './PetRetirement';
import { PetPhoto } from './PetPhoto';
import { Alert, Button, EmptyState, Field, FurrixScope, Input, Select, Textarea } from '../design-system';
import './pets.css';
import { CityInput } from '../places/CityInput';

const labels: Record<string, string> = { chien: 'Chien', chat: 'Chat', lapin: 'Lapin', oiseau: 'Oiseau', reptile: 'Reptile', rongeur: 'Rongeur', cheval: 'Cheval', ferme: 'Animal de ferme', balade: 'Balades', social: 'Socialisation', reproduction: 'Reproduction', show: 'Expositions', '♂': 'Mâle', '♀': 'Femelle' };
const meetingLabels: Record<string, string> = { balade: 'Balade', jeu: 'Jeu au parc', socialisation: 'Socialisation', petit: 'Petit', moyen: 'Moyen', grand: 'Grand' };
const blank: Required<PetFormValues> = { name: '', species: '', breed: '', age: '', gender: '', city: '', bio: '', purpose: '', goals: '', size: '', temperament: '', good_with: '', usual_outings: '', trait1: '', trait2: '', trait3: '' };
const fromPet = (pet: PetRow): Required<PetFormValues> => ({
  name: pet.name, species: pet.species, breed: pet.breed ?? '', age: pet.age ?? '', gender: pet.gender ?? '', city: pet.city ?? '', bio: pet.bio ?? '', purpose: pet.purpose ?? '',
  goals: (pet.meeting_goals ?? []).join(','), size: pet.size ?? '', temperament: pet.temperament ?? '', good_with: pet.good_with ?? '', usual_outings: pet.usual_outings ?? '',
  trait1: pet.behaviour_traits?.[0] ?? '', trait2: pet.behaviour_traits?.[1] ?? '', trait3: pet.behaviour_traits?.[2] ?? '',
});

function PetEditor({ client, ownerId, pet, onSaved, onCancel }: { client: FurrixClient; ownerId: string; pet: PetRow | null; onSaved: (pet: PetRow) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Required<PetFormValues>>(() => pet ? fromPet(pet) : { ...blank });
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
      <Field label="Ville *" error={errors.city}><CityInput id="pet-city" name="city" value={values.city} onChange={(city) => setValues((v) => ({ ...v, city }))} maxLength={PET_LIMITS.city} placeholder="Ex. Lille" required /></Field>
      <Field label="Objectif *" error={errors.purpose}><Select {...field('purpose')} required><option value="">Choisir un objectif</option>{PET_PURPOSES.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</Select></Field>
      <Field className="pet-full" label="Quelques mots sur lui" error={errors.bio}><Textarea {...field('bio')} maxLength={PET_LIMITS.bio} rows={4} placeholder="Son caractère, ses habitudes…" /></Field>
    </div></fieldset><fieldset disabled={busy}><legend>Pour les rencontres</legend><p className="app-small">Facultatif. Ces informations sont affichées sur sa carte, telles que tu les déclares.</p><div className="pet-fields">
<div className="pet-full" role="group" aria-labelledby="pet-goals-label"><span id="pet-goals-label">Il cherche</span><div className="pet-checks">{PET_MEETING_GOALS.map(goal=>{const list=values.goals?values.goals.split(','):[];const on=list.includes(goal);return <label key={goal}><input type="checkbox" checked={on} onChange={()=>setValues(v=>({...v,goals:(on?list.filter(g=>g!==goal):[...list,goal]).join(',')}))}/>{meetingLabels[goal]}</label>;})}</div>{errors.goals&&<p role="alert">{errors.goals}</p>}</div>
<Field label="Gabarit" error={errors.size}><Select {...field('size')}><option value="">Non renseigné</option>{PET_SIZES.map(v=><option key={v} value={v}>{meetingLabels[v]}</option>)}</Select></Field>
<Field label="Caractère" error={errors.temperament}><Input {...field('temperament')} maxLength={PET_MEETING_LIMITS.temperament}/></Field>
<Field label="S’entend avec" error={errors.good_with}><Input {...field('good_with')} maxLength={PET_MEETING_LIMITS.good_with}/></Field>
<Field label="Sorties habituelles" error={errors.usual_outings}><Input {...field('usual_outings')} maxLength={PET_MEETING_LIMITS.usual_outings}/></Field>
{(['trait1','trait2','trait3'] as const).map((key,i)=><Field key={key} label={`Comportement ${i+1}`} error={errors[key]}><Input {...field(key)} maxLength={PET_MEETING_LIMITS.trait}/></Field>)}
</div><p className="app-small">* Champs requis. Ces informations sont déclarées par tes soins et pourront apparaître sur sa carte.</p><div className="pet-actions"><Button type="submit" loading={busy}>Enregistrer le profil</Button><Button variant="out" onClick={onCancel}>Annuler</Button></div></fieldset>{error && <Alert tone="err" title={error} />}</form>
  </FurrixScope>;
}

function PetCard({ client, pet, ownerId, edit, retire, onSaved }: { client: FurrixClient; pet: PetRow; ownerId: string; edit: () => void; retire: () => void; onSaved: (pet: PetRow) => void }) {
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
  return <article className="pet-card"><PetPhoto client={client} pet={pet} /><div className="pet-card-body"><p className="app-eyebrow">{labels[pet.species] || pet.species}{pet.age ? ` · ${pet.age}` : ''}</p><h2>{pet.name}</h2><p>{pet.breed || 'Race non renseignée'} · {pet.city || 'Ville non renseignée'}</p>{pet.bio && <p className="pet-bio">{pet.bio}</p>}<p className="app-small">{pet.purpose ? `Objectif : ${labels[pet.purpose] || pet.purpose}` : 'Objectif non renseigné'}</p><div className="pet-actions"><Button variant="out" size="sm" disabled={busy} onClick={edit}>Modifier le profil de {pet.name}</Button><Button variant="quiet" size="sm" disabled={busy} onClick={retire}>Retirer le profil de {pet.name}</Button>{Capacitor.isNativePlatform() ? <NativePhotoActions busy={busy} onPhoto={upload} /> : <label className="pet-upload fx-btn fx-btn--ink fx-btn--sm" aria-busy={busy || undefined}>{busy ? 'Envoi…' : pet.photos?.length ? 'Remplacer la photo' : 'Ajouter une photo'}<input aria-label={`Photo de ${pet.name}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void upload(file); }} /></label>}</div><p className="app-small">Photo principale privée · JPEG, PNG ou WebP · 5 Mo maximum. HEIC non pris en charge. Le remplacement retire les anciennes photos de ce profil.</p>{message && <p role="status" className="pet-message">{message}</p>}</div></article>;
}

export default function PetsWorkspace({ client, ownerId, pets, onSaved, onRetired, reload }: { client: FurrixClient; ownerId: string; pets: PetRow[]; onSaved: (pet: PetRow) => void; onRetired?: (id: string) => void; reload: () => void }) {
  const [editing, setEditing] = useState<PetRow | null | undefined>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('nouveau') === '1' ? null : undefined);
  const [retiring, setRetiring] = useState<PetRow>();
  const clearNewRoute = () => window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/animaux');
  useEffect(() => { const changed = () => { const query = new URLSearchParams(window.location.hash.split('?')[1] ?? ''); setEditing(query.get('nouveau') === '1' ? null : undefined); }; window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  const [notice, setNotice] = useState('');
  if (retiring) return <PetRetirement client={client} pet={retiring} onCancel={() => setRetiring(undefined)} onRetired={() => { const id=retiring.id; setRetiring(undefined); setNotice('Le profil a été retiré de tes animaux.'); try { const key='furrix:active-pet:'+ownerId; if(sessionStorage.getItem(key)===id)sessionStorage.removeItem(key); } catch {} if(onRetired)onRetired(id);else reload(); }} />;
  if (editing !== undefined) return <PetEditor key={editing?.id || 'new'} client={client} ownerId={ownerId} pet={editing} onCancel={() => {setEditing(undefined);clearNewRoute();}} onSaved={(pet) => { onSaved(pet); setEditing(undefined);clearNewRoute(); setNotice(`Le profil de ${pet.name} est enregistré.`); }} />;
  return <FurrixScope className="app-page pet-workspace"><div className="pet-heading"><div><p className="app-eyebrow">Ceux qui partagent ta vie</p><h1>Mes animaux</h1><p>Leur caractère, leurs habitudes, leur petite bouille.</p></div><Button onClick={() => { setNotice(''); setEditing(null); }}><Plus size={18} aria-hidden />Ajouter un animal</Button></div>{notice && <Alert tone="ok" title={notice} />}{pets.length ? <div className="pet-grid">{pets.map((pet) => <PetCard key={pet.id} client={client} pet={pet} ownerId={ownerId} edit={() => { setNotice(''); setEditing(pet); }} retire={() => {setNotice('');setRetiring(pet);}} onSaved={onSaved} />)}</div> : <EmptyState icon="paw" title="Chaque aventure commence avec eux.">Aucun animal n’est encore associé à cet espace. Ajoute son premier profil pour faire les présentations.</EmptyState>}<Button variant="quiet" size="sm" className="pet-reload" onClick={reload}>Recharger la liste</Button></FurrixScope>;
}
