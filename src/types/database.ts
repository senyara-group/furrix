// Contrat de base de données — extrait limité aux tables de ce lot (profiles, pets).
// Source : types générés depuis le schéma DEV (generate_typescript_types, lecture seule, 3 novembre 2026),
// réduits volontairement. Les autres tables seront ajoutées au fil du branchement.
// Les colonnes protégées (role, premium, verified, owner_id, dates) sont lisibles mais le client
// n'a pas le droit de les écrire (migration 0003) : les types Insert/Update ci-dessous l'expriment.

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
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
