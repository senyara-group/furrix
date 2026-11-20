import type {Professional,OwnProfessional,SaveProfessionalArgs} from '../professionals/types';
import type { Appointment, Slot } from '../professionals/appointments/types';
import type { Notification, Preference } from '../notifications/types';
import type { RetirementBlocker } from '../pets/retirement';
// Contrat de base de données — extrait limité aux tables de ce lot (profiles, pets).
// Source : types générés depuis le schéma DEV (generate_typescript_types, lecture seule, 3 novembre 2026),
// réduits volontairement. Les autres tables seront ajoutées au fil du branchement.
// Les colonnes protégées (role, premium, verified, owner_id, dates) sont lisibles mais le client
// n'a pas le droit de les écrire (migration 0003) : les types Insert/Update ci-dessous l'expriment.

import type { DiscoveryPet, PetMatch, MatchMessage, NewPetMatch, MyMatch, MeetingProposal } from '../meetings/types';
import type { MySitting, SitterProfile, SitterResult, SittingMessage, SittingReport, SittingRequest, SittingThread, SittingUpdate, ServicePrice } from '../sitting/types';
import type { LostAlert, LocalNotification, LostSector, LostSighting, PublishLostArgs } from '../lost-pets/types';
export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      professional_profiles: {Row:OwnProfessional;Insert:never;Update:never;Relationships:[]};
      lost_pets: { Row: import('../lost-pets/types').OwnLostRow; Insert: never; Update: never; Relationships: [] };
      lost_alert_subscriptions: { Row: LostSector; Insert: never; Update: never; Relationships: [] };
      local_notifications: { Row: LocalNotification; Insert: never; Update: never; Relationships: [] };
      lost_sightings: { Row: LostSighting; Insert: never; Update: never; Relationships: [] };
      pet_meeting_locations: {
        Row: { pet_id: string; latitude: number; longitude: number };
        Insert: never; Update: never; Relationships: [];
      };
      messages: { Row: MatchMessage; Insert: never; Update: never; Relationships: [] };
      sitter_profiles: { Row: SitterProfile; Insert: never; Update: never; Relationships: [] };
      sitter_services: { Row: ServicePrice & { sitter_id: string }; Insert: never; Update: never; Relationships: [] };
      sitting_requests: { Row: SittingRequest; Insert: never; Update: never; Relationships: [] };
      sitting_messages: { Row: SittingMessage; Insert: never; Update: never; Relationships: [] };
      sitting_updates: { Row: SittingUpdate; Insert: never; Update: never; Relationships: [] };
      sitting_reports: { Row: SittingReport; Insert: never; Update: never; Relationships: [] };
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
          /** Poids déclaré (texte libre, « 12 » ou « 12 kg »). */
          weight?: string | null;
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
      pet_retirement_blockers: {Args:{p_pet:string};Returns:RetirementBlocker[]};
      retire_pet_profile: {Args:{p_pet:string};Returns:undefined};
      list_app_notifications: {Args:{p_limit?:number;p_before?:string;p_before_id?:string;p_id?:string};Returns:Notification[]};
      read_app_notification: {Args:{p_id:string};Returns:undefined};
      read_all_app_notifications: {Args:Record<string,never>;Returns:undefined};
      get_notification_preferences: {Args:Record<string,never>;Returns:Preference[]};
      set_notification_preference: {Args:{p_category:string;p_push:boolean};Returns:undefined};
      publish_professional_slot: {Args:{p_id:string;p_starts:string;p_ends:string};Returns:undefined};
      close_professional_slot: {Args:{p_id:string};Returns:undefined};
      list_professional_slots: {Args:{p_professional:string};Returns:Slot[]};
      request_professional_appointment: {Args:{p_slot:string;p_pet:string;p_service:string;p_message:string;p_share:boolean;p_request:string};Returns:string};
      update_professional_appointment: {Args:{p_id:string;p_action:string;p_slot?:string;p_note?:string};Returns:undefined};
      list_professional_appointments: {Args:{p_id?:string};Returns:Appointment[]};
      search_professionals: {Args:{p_lat?:number;p_lng?:number;p_radius?:number;p_category?:string;p_professional?:string};Returns:Professional[]};
      save_professional_profile: {Args:SaveProfessionalArgs;Returns:OwnProfessional};
      set_professional_active: {Args:{p_active:boolean};Returns:undefined};
      register_android_push: { Args: { p_device: string; p_owner: string; p_token: string }; Returns: undefined };
      remove_android_push: { Args: { p_device: string; p_owner: string }; Returns: undefined };
      android_push_status: { Args: { p_device: string }; Returns: boolean };
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
      search_sitters: { Args: { p_lat?: number; p_lng?: number; p_radius?: number; p_service?: string; p_starts?: string; p_ends?: string; p_species?: string; p_sitter?: string }; Returns: SitterResult[] };
      save_sitter_profile: { Args: { p_kind: string; p_bio: string; p_city: string; p_lat: number; p_lng: number; p_species: string[]; p_max_weight: number | null; p_outdoor: string; p_services: ServicePrice[]; p_active?: boolean }; Returns: SitterProfile };
      create_sitting_request: { Args: { p_sitter: string; p_pet: string; p_service: string; p_starts: string; p_ends: string; p_message: string; p_request: string }; Returns: SittingRequest };
      update_sitting_request: { Args: { p_id: string; p_action: string; p_note?: string }; Returns: SittingRequest };
      list_my_sittings: { Args: { p_id?: string }; Returns: MySitting[] };
      list_sitting_threads: { Args: Record<string, never>; Returns: SittingThread[] };
      send_sitting_message: { Args: { p_owner: string; p_sitter: string; p_text: string; p_request: string }; Returns: SittingMessage };
      add_sitting_update: { Args: { p_sitting: string; p_text: string }; Returns: SittingUpdate };
      report_sitting: { Args: { p_sitting: string; p_category: string; p_details: string }; Returns: SittingReport };
      block_sitting_contact: { Args: { p_other: string }; Returns: undefined };
      set_sitter_photo: { Args: { p_path?: string | null }; Returns: string | null };
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
