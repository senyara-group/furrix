import type { FurrixClient } from "../services/supabaseClient";
import { AppError, toDataError } from "../services/errors";
export type RetirementBlocker = {
  section: "rencontres" | "garde" | "services" | "animaux_perdus";
  total: number;
};
export async function retirementBlockers(client: FurrixClient, pet: string) {
  const { data, error } = await client.rpc("pet_retirement_blockers", {
    p_pet: pet,
  });
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function retirePet(client: FurrixClient, pet: string) {
  const { error } = await client.rpc("retire_pet_profile", { p_pet: pet });
  if (error?.code === "23503")
    throw new AppError(
      "invalid_data",
      "Une activité reste à traiter. Actualise les vérifications avant de réessayer.",
    );
  if (error) throw toDataError(error);
  window.dispatchEvent(new Event("furrix:notifications-updated"));
}
