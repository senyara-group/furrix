import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AccountArea from './AccountArea';
import * as account from './service';
import * as lost from '../lost-pets/service';
import * as overviewService from '../app/accountOverview';
import { useAccountOverview } from '../app/useAccountOverview';
import { createFakeSupabase } from '../test/fakeSupabase';

const owner='owner-a';
const saved={id:owner,name:'Alice',city:'Lille'};
beforeEach(()=>{vi.spyOn(lost,'getSector').mockResolvedValue(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const mount=()=>{const fake=createFakeSupabase(),onSaved=vi.fn(),onSignOut=vi.fn().mockResolvedValue(false);const view=render(<AccountArea client={fake.client} owner={owner} email="alice@example.com" profile={{name:'Alice',city:'Lille'}} onSaved={onSaved} onSignOut={onSignOut}/>);return{fake,onSaved,onSignOut,...view};};

it('enregistre uniquement prénom et ville pour le compte courant, avec confirmation serveur',async()=>{
 const fake=createFakeSupabase();fake.respond({data:saved,error:null});
 expect(await account.saveProfile(fake.client,owner,{name:' Alice ',city:' Lille ',role:'admin'} as account.ProfileDraft)).toEqual(saved);
 expect(fake.calls).toContainEqual({table:'profiles',op:'update',args:[{name:'Alice',city:'Lille'}]});
 expect(fake.calls).toContainEqual({table:'profiles',op:'eq',args:['id',owner]});
 fake.respond({data:null,error:null});await expect(account.saveProfile(fake.client,owner,{name:'Alice',city:''})).rejects.toThrow(/pas pu être enregistré/);
});

it('refuse les champs invalides avant requête et accepte une ville effacée',async()=>{
 const fake=createFakeSupabase();
 for(const draft of [{name:' ',city:''},{name:'a'.repeat(81),city:''},{name:'Alice',city:'a'.repeat(81)},{name:'Al\u0000ice',city:''}])await expect(account.saveProfile(fake.client,owner,draft)).rejects.toThrow();
 expect(fake.calls).toEqual([]);
 expect(account.profileValues({name:' Zoé ',city:' '})).toEqual({name:'Zoé',city:null});
});

it('garde le brouillon après erreur puis affiche la confirmation et le profil sauvegardé',async()=>{
 const save=vi.spyOn(account,'saveProfile').mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({...saved,name:'Alicia'});
 const {onSaved}=mount();
 expect((screen.getByLabelText('E-mail') as HTMLInputElement).readOnly).toBe(true);
 fireEvent.change(screen.getByLabelText('Prénom'),{target:{value:'Alicia'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer mon profil'}));
 await screen.findByText('Profil non enregistré');
 expect((screen.getByLabelText('Prénom') as HTMLInputElement).value).toBe('Alicia');expect(onSaved).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer mon profil'}));
 await screen.findByText('Ton profil est enregistré.');
 expect(onSaved).toHaveBeenCalledWith({...saved,name:'Alicia'});expect(save).toHaveBeenCalledTimes(2);
});

it('ignore le double envoi et la réponse d’une fiche quittée',async()=>{
 let finish!:(value:account.SavedProfile)=>void;
 const save=vi.spyOn(account,'saveProfile').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const {onSaved,unmount}=mount();const button=screen.getByRole('button',{name:'Enregistrer mon profil'});
 fireEvent.click(button);fireEvent.click(button);expect(save).toHaveBeenCalledTimes(1);
 unmount();await act(async()=>finish(saved));expect(onSaved).not.toHaveBeenCalled();
});

it('réutilise le secteur existant et permet sa désactivation sans modifier le profil',async()=>{
 vi.mocked(lost.getSector).mockResolvedValueOnce({user_id:owner,latitude:50.63,longitude:3.06,radius_km:10,created_at:''}).mockResolvedValue(null);
 const sector=vi.spyOn(lost,'setSector').mockResolvedValue();
 const profile=vi.spyOn(account,'saveProfile');const {fake}=mount();
 fireEvent.click(await screen.findByRole('button',{name:'Désactiver et supprimer ma zone'}));
 await screen.findByText('Ton abonnement est désactivé et ta zone supprimée.');
 expect(sector).toHaveBeenCalledWith(fake.client,false,undefined,undefined,10);expect(profile).not.toHaveBeenCalled();
});

it('la confirmation du profil actualise l’accueil sans toucher aux animaux ou à un autre compte',async()=>{
 vi.spyOn(overviewService,'fetchAccountOverview').mockResolvedValue({profile:{name:'Alice',city:'Lille'},pets:[]});
 const {result}=renderHook(()=>useAccountOverview(createFake.client,owner));
 await waitFor(()=>expect(result.current.status).toBe('ready'));
 act(()=>result.current.saveProfile({...saved,name:'Alicia'}));expect(result.current.data?.profile.name).toBe('Alicia');
 act(()=>result.current.saveProfile({...saved,id:'owner-b',name:'Bob'}));expect(result.current.data?.profile.name).toBe('Alicia');
 expect(result.current.data?.pets).toEqual([]);
});
const createFake=createFakeSupabase();

it('une déconnexion échouée reste visible et peut être réessayée',async()=>{
 const {onSignOut}=mount();fireEvent.click(screen.getByRole('button',{name:'Déconnecter cet appareil'}));
 await screen.findByText('La déconnexion n’a pas abouti. Réessaie.');expect(onSignOut).toHaveBeenCalledTimes(1);
});

it('un secteur non chargé ne passe pas pour désactivé et peut être rechargé',async()=>{
 vi.mocked(lost.getSector).mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(null);
 mount();
 await screen.findByText('Ton abonnement n’a pas pu être vérifié.');
 expect(screen.queryByText('Tu ne reçois pas encore les alertes de secteur.')).toBeNull();
 expect((screen.getByRole('button',{name:'Activer les alertes pour ma zone actuelle'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Réessayer le chargement du secteur'}));
 await screen.findByText('Tu ne reçois pas encore les alertes de secteur.');
 expect((screen.getByRole('button',{name:'Activer les alertes pour ma zone actuelle'}) as HTMLButtonElement).disabled).toBe(false);
});
