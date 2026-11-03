// Contrat de base de données — extrait limité aux tables de ce lot (profiles, pets).
// Source : types générés depuis le schéma DEV (generate_typescript_types, lecture seule, 3 novembre 2026),
// réduits volontairement. Les autres tables seront ajoutées au fil du branchement.
// Les colonnes protégées (role, premium, verified, owner_id, dates) sont lisibles mais le client
// n'a pas le droit de les écrire (migration 0003) : les types Insert/Update ci-dessous l'expriment.

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
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
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type PetRow = Database['public']['Tables']['pets']['Row'];
export type PetInsert = Database['public']['Tables']['pets']['Insert'];
export type PetUpdate = Database['public']['Tables']['pets']['Update'];
