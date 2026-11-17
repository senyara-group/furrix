// Contrat de base de données — extrait limité aux tables de ce lot (profiles, pets).
// Source : types générés depuis le schéma DEV (generate_typescript_types, lecture seule, 3 novembre 2026),
// réduits volontairement. Les autres tables seront ajoutées au fil du branchement.
// Les colonnes protégées (role, premium, verified, owner_id, dates) sont lisibles mais le client
// n'a pas le droit de les écrire (migration 0003) : les types Insert/Update ci-dessous l'expriment.

import type { DiscoveryPet, PetMatch, MatchMessage } from '../meetings/types';
export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      pet_meeting_locations: {
        Row: { pet_id: string; latitude: number; longitude: number };
        Insert: never; Update: never; Relationships: [];
      };
      messages: { Row: MatchMessage; Insert: never; Update: never; Relationships: [] };
      registration_consents: {
        Row: { user_id: string; terms_version: string; privacy_version: string; declared_adult: boolean; recorded_at: string; source: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string | null;
          city: string | null;
          bio: string | null;
          role: string;
          premium: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { name?: string | null; city?: string | null; bio?: string | null };
        Relationships: [];
      };
      pets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          species: string;
          breed: string | null;
          age: string | null;
          gender: string | null;
          purpose: string | null;
          city: string | null;
          bio: string | null;
          photos: string[] | null;
          verified: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          species: string;
          breed?: string | null;
          age?: string | null;
          gender?: string | null;
          purpose?: string | null;
          city?: string | null;
          bio?: string | null;
          photos?: string[] | null;
        };
        Update: {
          name?: string;
          species?: string;
          breed?: string | null;
          age?: string | null;
          gender?: string | null;
          purpose?: string | null;
          city?: string | null;
          bio?: string | null;
          photos?: string[] | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      discover_pets: { Args: { p_pet: string; p_species?: string; p_purpose?: string; p_radius?: number; p_after?: string; p_limit?: number }; Returns: DiscoveryPet[] };
      swipe_and_match: { Args: { p_pet: string; p_target: string; p_dir: string }; Returns: string | null };
      set_pet_meeting_location: { Args: { p_pet: string; p_lat?: number; p_lng?: number }; Returns: undefined };
      list_pet_matches: { Args: { p_pet: string }; Returns: PetMatch[] };
      send_match_message: { Args: { p_match: string; p_text: string; p_request: string }; Returns: MatchMessage };
      private_beta_status: { Args: Record<string, never>; Returns: string };
      can_use_private_beta: { Args: Record<string, never>; Returns: boolean };
      accept_private_beta_notice: { Args: { p_adult: boolean; p_read_notice: boolean }; Returns: undefined };
      accept_registration_terms: { Args: { p_terms: string; p_privacy: string; p_adult: boolean }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type PetRow = Database['public']['Tables']['pets']['Row'];
export type PetInsert = Database['public']['Tables']['pets']['Insert'];
export type PetUpdate = Database['public']['Tables']['pets']['Update'];
