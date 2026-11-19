// Contrat de base de données — extrait limité aux tables de ce lot (profiles, pets).
// Source : types générés depuis le schéma DEV (generate_typescript_types, lecture seule, 3 novembre 2026),
// réduits volontairement. Les autres tables seront ajoutées au fil du branchement.
// Les colonnes protégées (role, premium, verified, owner_id, dates) sont lisibles mais le client
// n'a pas le droit de les écrire (migration 0003) : les types Insert/Update ci-dessous l'expriment.

import type { DiscoveryPet, PetMatch, MatchMessage, NewPetMatch, MyMatch, MeetingProposal } from '../meetings/types';
import type { LostAlert, LocalNotification, LostSector, LostSighting, PublishLostArgs } from '../lost-pets/types';
export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      lost_pets: { Row: import('../lost-pets/types').OwnLostRow; Insert: never; Update: never; Relationships: [] };
      lost_alert_subscriptions: { Row: LostSector; Insert: never; Update: never; Relationships: [] };
      local_notifications: { Row: LocalNotification; Insert: never; Update: never; Relationships: [] };
      lost_sightings: { Row: LostSighting; Insert: never; Update: never; Relationships: [] };
      pet_meeting_locations: {
        Row: { pet_id: string; latitude: number; longitude: number };
        Insert: never; Update: never; Relationships: [];
      };
      messages: { Row: MatchMessage; Insert: never; Update: never; Relationships: [] };
      meeting_proposals: { Row: MeetingProposal; Insert: never; Update: never; Relationships: [] };
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
          meeting_goals?: string[];
          size?: string | null;
          temperament?: string | null;
          good_with?: string | null;
          usual_outings?: string | null;
          behaviour_traits?: string[];
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
          meeting_goals?: string[];
          size?: string | null;
          temperament?: string | null;
          good_with?: string | null;
          usual_outings?: string | null;
          behaviour_traits?: string[];
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
          meeting_goals?: string[];
          size?: string | null;
          temperament?: string | null;
          good_with?: string | null;
          usual_outings?: string | null;
          behaviour_traits?: string[];
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      publish_lost_alert: { Args: PublishLostArgs; Returns: string };
      list_lost_alerts: { Args: { p_city?: string; p_after?: string; p_limit?: number; p_id?: string }; Returns: LostAlert[] };
      update_lost_alert: { Args: { p_id: string; p_description: string; p_instructions: string; p_status: string }; Returns: undefined };
      add_lost_sighting: { Args: { p_id: string; p_alert: string; p_seen: string; p_city: string; p_message: string }; Returns: string };
      set_lost_alert_sector: { Args: { p_enabled: boolean; p_lat?: number; p_lng?: number; p_radius?: number }; Returns: undefined };
      read_local_notification: { Args: { p_id: string }; Returns: undefined };
      report_lost_alert: { Args: { p_id: string; p_reason: string }; Returns: undefined };
      discover_pets: { Args: { p_pet: string; p_species?: string; p_purpose?: string; p_radius?: number; p_after?: string; p_limit?: number; p_goal?: string; p_size?: string }; Returns: DiscoveryPet[] };
      list_new_pet_matches: { Args: { p_pet: string }; Returns: NewPetMatch[] };
      list_my_matches: { Args: { p_match?: string }; Returns: MyMatch[] };
      create_meeting_proposal: { Args: { p_match: string; p_activity: string; p_place: string; p_slots: string[]; p_message: string; p_request: string }; Returns: MeetingProposal };
      update_meeting_proposal: { Args: { p_id: string; p_action: string; p_slot?: string; p_note?: string }; Returns: MeetingProposal };
      end_pet_match: { Args: { p_match: string }; Returns: undefined };
      report_or_block_match: { Args: { p_match: string; p_reason: string; p_details: string; p_report: boolean }; Returns: undefined };
      mark_pet_match_seen: { Args: { p_match: string; p_pet: string }; Returns: undefined };
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
