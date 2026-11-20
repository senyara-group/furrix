import type { FurrixClient } from "../../services/supabaseClient";
import type { MyMatch } from "../../meetings/types";
import type { MySitting } from "../../sitting/types";
import type { Appointment } from "../../professionals/appointments/types";
export type HomeMatch = Pick<
  MyMatch,
  "match_id" | "my_pet_name" | "name" | "proposal_status" | "proposal_slot"
>;
export type HomeSitting = Pick<
  MySitting,
  "id" | "role" | "pet_name" | "starts_at" | "ends_at" | "status"
>;
export type HomeAppointment = Pick<
  Appointment,
  | "id"
  | "role"
  | "professional_name"
  | "pet_name"
  | "service_name"
  | "starts_at"
  | "ends_at"
  | "status"
>;
export type HomeActivity = {
  matches: HomeMatch[];
  sittings: HomeSitting[];
  appointments: HomeAppointment[];
  failed: string[];
};
/** Projections réduites des accès existants : aucun texte privé, tarif ou chemin de photo téléchargé. */
export async function loadHomeActivity(
  client: FurrixClient,
  signal: AbortSignal,
): Promise<HomeActivity> {
  const results = await Promise.allSettled([
    client
      .rpc("list_my_matches", {})
      .select("match_id,my_pet_name,name,proposal_status,proposal_slot")
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    client
      .rpc("list_my_sittings", {})
      .select("id,role,pet_name,starts_at,ends_at,status")
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    client
      .rpc("list_professional_appointments", {})
      .select(
        "id,role,professional_name,pet_name,service_name,starts_at,ends_at,status",
      )
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
  ]);
  const [matches, sittings, appointments] = results;
  return {
    matches: matches.status === "fulfilled" ? matches.value : [],
    sittings: sittings.status === "fulfilled" ? sittings.value : [],
    appointments: appointments.status === "fulfilled" ? appointments.value : [],
    failed: results.flatMap((r, i) =>
      r.status === "rejected" ? [["Rencontres", "Garde", "Services"][i]!] : [],
    ),
  };
}
